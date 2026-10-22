// function handleSignIn() {
//   const email = document.getElementById("sf-email").value.trim();
//   const password = document.getElementById("sf-pass").value;

//   if (!email || !password) {
//     alert("Please fill in all fields.");
//     return;
//   }

//   const btn = document.querySelector(".btn-primary");
//   btn.textContent = "Signing in…";
//   btn.disabled = true;

//   fetch("/api", {  // ✅ FIXED: with /api/
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({ email, password }),
//   })
//     .then((resp) => {
//       if (!resp.ok) {
//         return resp.json().then((err) => {
//           throw new Error(err.error || "Login failed.");
//         });
//       }
//       return resp.json();
//     })
//     .then((data) => {
//       window.location.href = "../pages/Dashboard.html";
//     })
//     .catch((err) => {
//       alert("Error: " + err.message);
//       btn.textContent = "Sign In";
//       btn.disabled = false;
//     });
// }

// // Password toggle
// function togglePw() {
//   const inp = document.getElementById("sf-pass");
//   const btn = document.getElementById("sf-eye-icon-btn");
//   const icon = btn.querySelector("i");

//   if (inp.type === "password") {
//     inp.type = "text";
//     icon.classList.add("fa-eye-slash");
//     icon.classList.remove("fa-eye");
//   } else {
//     inp.type = "password";
//     icon.classList.add("fa-eye");
//     icon.classList.remove("fa-eye-slash");
//   }
// }