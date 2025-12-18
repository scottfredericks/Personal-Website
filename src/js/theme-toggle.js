const toggleBtn = document.getElementById("theme-toggle");

toggleBtn.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";

    // Update HTML attribute
    document.documentElement.setAttribute("data-theme", newTheme);
    
    // Persist to local storage
    localStorage.setItem("theme", newTheme);
});