const toggleBtn = document.getElementById("theme-toggle");

toggleBtn.addEventListener("click", () => {
  // 1. Get current setting, defaulting to "dark" if the attribute is missing
  const currentTheme = document.documentElement.getAttribute("data-theme") ||
    "dark";

  // 2. Determine new theme
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  // 3. Update DOM
  if (newTheme === "dark") {
    // Option A: Remove the attribute to revert to :root CSS
    document.documentElement.removeAttribute("data-theme");
  } else {
    // Option B: Set it explicitly
    document.documentElement.setAttribute("data-theme", "light");
  }

  // 4. Update Storage
  localStorage.setItem("theme", newTheme);
});
