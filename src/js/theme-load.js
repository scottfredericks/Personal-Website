// Immediately check local storage
(function () {
  const savedTheme = localStorage.getItem("theme");
  // Only apply 'light' if specifically saved.
  // Otherwise, we do nothing, which defaults to ':root' (Dark).
  if (savedTheme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
