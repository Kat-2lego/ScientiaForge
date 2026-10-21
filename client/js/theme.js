/* ==========================================================================
 * SkillForge — theme controller
 *
 * Loaded in <head> on EVERY page, before the stylesheets paint. It sets
 * data-theme on <html> synchronously so a dark-mode user never sees a white
 * flash while the rest of the page loads.
 *
 * The choice lives in localStorage under "sf-theme", so it survives reloads
 * and applies across every screen. "system" follows the operating system.
 *
 * Public API (used by Settings.html, available anywhere):
 *   SkillForgeTheme.get()          -> "light" | "dark" | "system"
 *   SkillForgeTheme.resolved()     -> "light" | "dark"  (what is on screen)
 *   SkillForgeTheme.set("dark")    -> apply and persist
 *   SkillForgeTheme.toggle()       -> flip light <-> dark, returns the new one
 *   SkillForgeTheme.onChange(fn)   -> called with the resolved theme on change
 * ======================================================================== */

(function () {
  "use strict";

  var STORAGE_KEY = "sf-theme";
  var VALID = ["light", "dark", "system"];
  var listeners = [];

  function systemPrefersDark() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function readStored() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      return VALID.indexOf(stored) !== -1 ? stored : "system";
    } catch (error) {
      // Private browsing or storage disabled: fall back to the OS setting.
      return "system";
    }
  }

  function resolve(choice) {
    if (choice === "dark") return "dark";
    if (choice === "light") return "light";
    return systemPrefersDark() ? "dark" : "light";
  }

  function apply(choice) {
    var resolved = resolve(choice);
    var root = document.documentElement;

    root.setAttribute("data-theme", resolved);
    // Tells the browser to render native controls (scrollbars, form fields,
    // date pickers) in the matching scheme.
    root.style.colorScheme = resolved;

    return resolved;
  }

  function notify(resolved) {
    for (var i = 0; i < listeners.length; i += 1) {
      try {
        listeners[i](resolved);
      } catch (error) {
        console.warn("Theme listener failed:", error);
      }
    }
  }

  // Run immediately, before the body exists — this is the anti-flash step.
  var current = readStored();
  apply(current);

  var api = {
    get: function () {
      return current;
    },

    resolved: function () {
      return resolve(current);
    },

    set: function (choice) {
      if (VALID.indexOf(choice) === -1) choice = "system";
      current = choice;
      try {
        localStorage.setItem(STORAGE_KEY, choice);
      } catch (error) {
        console.warn("Could not save the theme preference:", error);
      }
      var resolved = apply(choice);
      notify(resolved);
      return resolved;
    },

    toggle: function () {
      return api.set(api.resolved() === "dark" ? "light" : "dark");
    },

    onChange: function (fn) {
      if (typeof fn === "function") listeners.push(fn);
    }
  };

  window.SkillForgeTheme = api;

  // Another tab changed the theme: follow it, so all open screens agree.
  window.addEventListener("storage", function (event) {
    if (event.key !== STORAGE_KEY) return;
    current = readStored();
    notify(apply(current));
  });

  // Following the OS setting means reacting when the OS setting changes.
  if (window.matchMedia) {
    var query = window.matchMedia("(prefers-color-scheme: dark)");
    var onSystemChange = function () {
      if (current === "system") notify(apply(current));
    };
    if (query.addEventListener) {
      query.addEventListener("change", onSystemChange);
    } else if (query.addListener) {
      query.addListener(onSystemChange);   // older browsers
    }
  }

  /* --------------------------------------------------------------------
   * Wire any dark-mode switch on the page. Settings.html has
   * #darkModeToggle; any other page can add one with the same id or with
   * [data-theme-toggle] and it will work with no extra code.
   * ------------------------------------------------------------------ */
  function wireControls() {
    var controls = [];
    var byId = document.getElementById("darkModeToggle");
    if (byId) controls.push(byId);

    var byAttr = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < byAttr.length; i += 1) {
      if (controls.indexOf(byAttr[i]) === -1) controls.push(byAttr[i]);
    }

    controls.forEach(function (control) {
      var isCheckbox =
        control.tagName === "INPUT" && control.type === "checkbox";

      if (isCheckbox) {
        control.checked = api.resolved() === "dark";
        control.addEventListener("change", function () {
          api.set(control.checked ? "dark" : "light");
        });
      } else {
        control.addEventListener("click", function () {
          api.toggle();
        });
      }

      // Keep the control honest if the theme changes elsewhere.
      api.onChange(function (resolved) {
        if (isCheckbox) control.checked = resolved === "dark";
        control.setAttribute("aria-pressed", String(resolved === "dark"));
      });

      control.setAttribute("aria-pressed", String(api.resolved() === "dark"));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireControls);
  } else {
    wireControls();
  }
})();
