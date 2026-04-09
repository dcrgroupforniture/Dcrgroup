(function () {
  const body = document.body;

  // carica tema salvato
  if (localStorage.getItem("theme") === "light") {
    body.classList.add("light");
  }

  window.toggleTheme = function () {
    body.classList.toggle("light");
    localStorage.setItem(
      "theme",
      body.classList.contains("light") ? "light" : "dark"
    );
  };
})();
