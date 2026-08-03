"use strict";

/*
  Authentication is handled by the main SkillForge server.
*/
const LOGIN_API_URL =
  "http://localhost:5001/api/auth/login";

/* =========================================================
   PAGE ELEMENTS
========================================================= */

const emailInput =
  document.getElementById("sf-email");

const passwordInput =
  document.getElementById("sf-pass");

const rememberInput =
  document.getElementById("sf-remember");

const loginButton =
  document.querySelector(".final-login-btn");

const loginButtonText =
  loginButton?.querySelector(".btn-inner-text");

/* =========================================================
   LOGIN MESSAGE
========================================================= */

function removeLoginMessage() {
  const existingMessage =
    document.getElementById("login-message");

  if (existingMessage) {
    existingMessage.remove();
  }
}

function showLoginMessage(
  message,
  type = "error"
) {
  removeLoginMessage();

  const loginForm =
    document.getElementById("loginForm");

  if (!loginForm) {
    alert(message);
    return;
  }

  const messageBox =
    document.createElement("div");

  messageBox.id = "login-message";
  messageBox.textContent = message;

  messageBox.style.width = "100%";
  messageBox.style.padding = "12px 14px";
  messageBox.style.marginBottom = "18px";
  messageBox.style.borderRadius = "10px";
  messageBox.style.fontSize = "14px";
  messageBox.style.fontWeight = "600";
  messageBox.style.lineHeight = "1.5";

  if (type === "success") {
    messageBox.style.color = "#087f5b";
    messageBox.style.background = "#ebfbee";
    messageBox.style.border =
      "1px solid #b2f2bb";
  } else {
    messageBox.style.color = "#c92a2a";
    messageBox.style.background = "#fff5f5";
    messageBox.style.border =
      "1px solid #ffc9c9";
  }

  loginForm.insertBefore(
    messageBox,
    loginForm.firstChild
  );
}

/* =========================================================
   LOADING STATE
========================================================= */

function setLoginLoading(isLoading) {
  if (!loginButton) {
    return;
  }

  loginButton.disabled = isLoading;

  if (loginButtonText) {
    loginButtonText.textContent =
      isLoading
        ? "Signing in..."
        : "Sign In";
  }
}

/* =========================================================
   CLEAR OLD SESSION
========================================================= */

function clearOldLoginSession() {
  const keys = [
    "sb-access-token",
    "access_token",
    "refresh_token",
    "user",
    "user_id",
    "user_email",
    "isLoggedIn"
  ];

  keys.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

/* =========================================================
   SAVE LOGIN SESSION
========================================================= */

function saveLoginSession(data) {
  clearOldLoginSession();

  /*
    Always store authentication details in localStorage.

    This prevents the dashboard from redirecting back to
    the login page when it checks for the access token.
  */

  localStorage.setItem(
    "sb-access-token",
    data.access_token
  );

  localStorage.setItem(
    "access_token",
    data.access_token
  );

  localStorage.setItem(
    "isLoggedIn",
    "true"
  );

  if (data.refresh_token) {
    localStorage.setItem(
      "refresh_token",
      data.refresh_token
    );
  }

  localStorage.setItem(
    "user",
    JSON.stringify(data.user)
  );

  if (data.user?.id) {
    localStorage.setItem(
      "user_id",
      data.user.id
    );
  }

  if (data.user?.email) {
    localStorage.setItem(
      "user_email",
      data.user.email
    );
  }

  /*
    Remember Me now controls only whether the email
    is automatically filled in next time.
  */

  if (
    rememberInput?.checked &&
    data.user?.email
  ) {
    localStorage.setItem(
      "remembered_email",
      data.user.email
    );
  } else {
    localStorage.removeItem(
      "remembered_email"
    );
  }
}

/* =========================================================
   READ RESPONSE SAFELY
========================================================= */

async function readLoginResponse(response) {
  const responseText =
    await response.text();

  const contentType =
    response.headers.get("content-type") || "";

  if (
    !contentType.includes("application/json")
  ) {
    console.error(
      "NON-JSON LOGIN RESPONSE:",
      responseText
    );

    throw new Error(
      "The login request reached the wrong server. Open SkillForge on http://localhost:5001."
    );
  }

  try {
    return JSON.parse(responseText);
  } catch {
    console.error(
      "INVALID LOGIN RESPONSE:",
      responseText
    );

    throw new Error(
      "The server returned invalid login information."
    );
  }
}

/* =========================================================
   SIGN IN
========================================================= */

async function handleSignIn() {
  removeLoginMessage();

  const email =
    emailInput?.value
      .trim()
      .toLowerCase() || "";

  const password =
    passwordInput?.value || "";

  if (!email || !password) {
    showLoginMessage(
      "Please fill in all fields."
    );

    return;
  }

  if (
    emailInput &&
    !emailInput.validity.valid
  ) {
    showLoginMessage(
      "Please enter a valid email address."
    );

    return;
  }

  if (password.length < 8) {
    showLoginMessage(
      "Password must be at least 8 characters."
    );

    return;
  }

  setLoginLoading(true);

  try {
    const response = await fetch(
      LOGIN_API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json"
        },

        body: JSON.stringify({
          email,
          password
        })
      }
    );

    const data =
      await readLoginResponse(response);

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Login failed. Check your email and password."
      );
    }

    if (
      !data.access_token ||
      !data.user
    ) {
      throw new Error(
        "The server did not return a valid login session."
      );
    }

    saveLoginSession(data);

    console.log(
      "Access token saved:",
      Boolean(
        localStorage.getItem(
          "sb-access-token"
        )
      )
    );

    showLoginMessage(
      "Login successful. Opening your dashboard...",
      "success"
    );

    window.setTimeout(() => {
      window.location.href =
        "/pages/Dashboard.html";
    }, 700);

  } catch (error) {
    console.error(
      "LOGIN ERROR:",
      error
    );

    showLoginMessage(
      error.message ||
      "Login failed. Please try again."
    );

  } finally {
    setLoginLoading(false);
  }
}

/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

function togglePw() {
  if (!passwordInput) {
    return;
  }

  const passwordIsHidden =
    passwordInput.type === "password";

  passwordInput.type =
    passwordIsHidden
      ? "text"
      : "password";

  const eyeIcon =
    document.querySelector(
      "#sf-eye-icon-btn i"
    );

  if (!eyeIcon) {
    return;
  }

  if (passwordIsHidden) {
    eyeIcon.classList.remove("fa-eye");
    eyeIcon.classList.add("fa-eye-slash");
  } else {
    eyeIcon.classList.remove("fa-eye-slash");
    eyeIcon.classList.add("fa-eye");
  }
}

/* =========================================================
   REMEMBERED EMAIL
========================================================= */

function loadRememberedEmail() {
  const rememberedEmail =
    localStorage.getItem(
      "remembered_email"
    );

  if (
    rememberedEmail &&
    emailInput
  ) {
    emailInput.value =
      rememberedEmail;

    if (rememberInput) {
      rememberInput.checked = true;
    }
  }
}

/* =========================================================
   INITIALISE
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadRememberedEmail();
  }
);

/*
  Required because LogIn.html calls these functions
  through inline HTML attributes.
*/

window.handleSignIn =
  handleSignIn;

window.togglePw =
  togglePw;