"use strict";

/*
  The login page is opened through the main SkillForge server:

  http://localhost:5000/pages/LogIn.html

  Using a relative URL means the login request automatically goes to:

  http://localhost:5000/api/auth/login
*/
const LOGIN_API_URL = "/api/auth/login";

/* =========================================================
   DOM ELEMENTS
========================================================= */

const loginForm =
  document.getElementById("loginForm");

const emailInput =
  document.getElementById("sf-email");

const passwordInput =
  document.getElementById("sf-pass");

const rememberInput =
  document.getElementById("sf-remember");

const loginButton =
  document.querySelector(".final-login-btn");

const buttonText =
  loginButton?.querySelector(".btn-inner-text");

/* =========================================================
   MESSAGE DISPLAY
========================================================= */

function removeExistingMessage() {
  const oldMessage =
    document.getElementById("login-message");

  if (oldMessage) {
    oldMessage.remove();
  }
}

function showLoginMessage(
  message,
  type = "error"
) {
  removeExistingMessage();

  if (!loginForm) {
    alert(message);
    return;
  }

  const messageBox =
    document.createElement("div");

  messageBox.id = "login-message";
  messageBox.textContent = message;

  messageBox.style.width = "100%";
  messageBox.style.marginBottom = "18px";
  messageBox.style.padding = "12px 14px";
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

  if (buttonText) {
    buttonText.textContent = isLoading
      ? "Signing in..."
      : "Sign In";
  }
}

/* =========================================================
   SESSION STORAGE
========================================================= */

function clearStoredLoginSession() {
  const keys = [
    "access_token",
    "refresh_token",
    "user",
    "user_id",
    "user_email"
  ];

  keys.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

function saveLoginSession(data) {
  clearStoredLoginSession();

  /*
    Remember me checked:
    Save the session in localStorage.

    Remember me unchecked:
    Save it in sessionStorage.
  */
  const storage =
    rememberInput?.checked
      ? localStorage
      : sessionStorage;

  storage.setItem(
    "access_token",
    data.access_token
  );

  if (data.refresh_token) {
    storage.setItem(
      "refresh_token",
      data.refresh_token
    );
  }

  storage.setItem(
    "user",
    JSON.stringify(data.user)
  );

  if (data.user?.id) {
    storage.setItem(
      "user_id",
      data.user.id
    );
  }

  if (data.user?.email) {
    storage.setItem(
      "user_email",
      data.user.email
    );
  }

  /*
    Save only the email for the Remember Me field.
    Never save the password.
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
   SAFE JSON RESPONSE HANDLING
========================================================= */

async function readLoginResponse(response) {
  const responseText =
    await response.text();

  const contentType =
    response.headers.get("content-type") || "";

  /*
    This prevents the error:

    Unexpected token '<', "<!DOCTYPE"... is not valid JSON
  */
  if (
    !contentType.includes("application/json")
  ) {
    console.error(
      "NON-JSON LOGIN RESPONSE:",
      responseText
    );

    throw new Error(
      "The login request reached the wrong server. Open the project using http://localhost:5000/pages/LogIn.html."
    );
  }

  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error(
      "INVALID LOGIN JSON:",
      responseText
    );

    throw new Error(
      "The main server returned invalid login information."
    );
  }
}

/* =========================================================
   LOGIN VALIDATION
========================================================= */

function validateLoginDetails(
  email,
  password
) {
  if (!email || !password) {
    throw new Error(
      "Please enter your email address and password."
    );
  }

  if (
    emailInput &&
    !emailInput.validity.valid
  ) {
    throw new Error(
      "Please enter a valid email address."
    );
  }

  if (password.length < 8) {
    throw new Error(
      "Your password must contain at least 8 characters."
    );
  }
}

/* =========================================================
   SIGN IN
========================================================= */

async function handleSignIn() {
  removeExistingMessage();

  const email =
    emailInput?.value
      .trim()
      .toLowerCase() || "";

  const password =
    passwordInput?.value || "";

  try {
    validateLoginDetails(
      email,
      password
    );
  } catch (error) {
    showLoginMessage(
      error.message
    );

    return;
  }

  setLoginLoading(true);

  try {
    const response =
      await fetch(
        LOGIN_API_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json"
          },

          body:
            JSON.stringify({
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

    showLoginMessage(
      "Login successful. Opening your dashboard...",
      "success"
    );

    window.setTimeout(() => {
      window.location.href =
        "/pages/dashboard.html";
    }, 600);

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
   SHOW OR HIDE PASSWORD
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
    eyeIcon.classList.remove(
      "fa-eye"
    );

    eyeIcon.classList.add(
      "fa-eye-slash"
    );
  } else {
    eyeIcon.classList.remove(
      "fa-eye-slash"
    );

    eyeIcon.classList.add(
      "fa-eye"
    );
  }
}

/* =========================================================
   LOAD REMEMBERED EMAIL
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
      rememberInput.checked =
        true;
    }
  }
}

/* =========================================================
   PAGE INITIALISATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadRememberedEmail();

    /*
      This is optional protection in case the inline
      onsubmit attribute is removed later.
    */
    if (
      loginForm &&
      !loginForm.hasAttribute(
        "onsubmit"
      )
    ) {
      loginForm.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();
          await handleSignIn();
        }
      );
    }
  }
);

/*
  Your LogIn.html calls these functions directly:

  handleSignIn()
  togglePw()

  Therefore, they must be available globally.
*/
window.handleSignIn =
  handleSignIn;

window.togglePw =
  togglePw;