/*
 * pod-ui.js — the few behaviours every identity page shares. Loaded as a
 * BLOCKING script in <head> (main.html.ejs and welcome/index.html), served at
 * /.well-known/css/scripts/pod-ui.js by a bind mount (docker-compose.yml).
 *
 * 1. Theme, before first paint. A deferred or module script runs too late: a
 *    Dark choice would flash light on every page load. Same storage key,
 *    choices and resolution as solid-kit src/ui/theme.ts (ADR 008, amended),
 *    so one stored choice means the same thing everywhere on this origin.
 *    Light is the default, stamped `data-theme="light"` in the HTML, and
 *    choosing it clears the stored value. "system" (same as this device) is
 *    resolved here, contrast first, then dark, and followed while the page is
 *    open; it is never stamped. High contrast is reached only that way.
 * 2. The theme button: one icon button cycling Light, Dark, Same as this
 *    device, its label naming the current choice; wired by delegation.
 * 3. A page whose controls never arrive. CSS's page scripts start with
 *    `await fetchControls(...)` and nothing catches it: on a network error or
 *    a server error the submit stays disabled and the page says nothing. Put
 *    a sentence in #error instead.
 */
(function () {
  "use strict";

  var KEY = "solid-kit:theme";
  var CHOICES = ["light", "dark", "system"];
  var root = document.documentElement;
  var unstored = "light"; // without storage, the choice holds until a reload

  function storedChoice() {
    try {
      var c = localStorage.getItem(KEY);
      return c === "dark" || c === "system" ? c : "light";
    } catch (e) { return unstored; }
  }

  function device() {
    if (!window.matchMedia) return "light";
    if (matchMedia("(prefers-contrast: more)").matches) return "contrast";
    if (matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  }

  function apply(choice) {
    root.setAttribute("data-theme", choice === "system" ? device() : choice);
  }

  apply(storedChoice());
  if (window.matchMedia) {
    ["(prefers-contrast: more)", "(prefers-color-scheme: dark)"].forEach(function (q) {
      var m = matchMedia(q);
      if (m.addEventListener) m.addEventListener("change", function () {
        if (storedChoice() === "system") apply("system");
      });
    });
  }

  // 24-unit icons in currentColor, as the kit draws them.
  var ICONS = {
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    system: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'
  };

  function label(choice) {
    return "Theme: " + (choice === "system" ? "same as this device" : choice) + ". Change it";
  }

  // The markup is ours (a constant icon), never anything from outside.
  function show(choice) {
    var buttons = document.querySelectorAll("[data-theme-button]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("data-theme-choice", choice);
      buttons[i].setAttribute("aria-label", label(choice));
      buttons[i].title = label(choice);
      buttons[i].innerHTML = '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[choice] + "</svg>";
    }
  }

  document.addEventListener("DOMContentLoaded", function () { show(storedChoice()); });

  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-theme-button]");
    if (!button) return;
    var from = button.getAttribute("data-theme-choice");
    if (CHOICES.indexOf(from) === -1) from = storedChoice();
    var choice = CHOICES[(CHOICES.indexOf(from) + 1) % CHOICES.length];
    unstored = choice;
    try {
      if (choice === "light") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch (e) { /* applies to this view only */ }
    apply(choice);
    show(choice);
  });

  window.addEventListener("unhandledrejection", function () {
    var error = document.getElementById("error");
    if (!error || error.textContent.trim()) return; // a server message is already shown: keep it
    error.textContent = "This page could not reach the server. Reload it; nothing you typed was sent.";
    error.classList.remove("hidden");
  });
})();
