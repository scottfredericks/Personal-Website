const toggleBtn = document.getElementById("theme-toggle");

// Get references to the navbar elements
const navMenu = document.getElementById("nav-menu-wrapper");
const hamburger = document.getElementById("hamburger-btn");

toggleBtn.addEventListener("click", () => {
  // Get current setting
  const currentTheme = document.documentElement.getAttribute("data-theme") ||
    "dark";

  // Determine new theme
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  // Update DOM
  if (newTheme === "dark") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", "light");
  }

  // Update Storage
  localStorage.setItem("theme", newTheme);

  // Check if the menu wrapper exists and is currently open
  if (navMenu && navMenu.classList.contains("active")) {
    // Close the drawer
    navMenu.classList.remove("active");

    // Reset the hamburger button accessibility state and animation
    if (hamburger) {
      hamburger.setAttribute("aria-expanded", "false");
    }
  }
});
