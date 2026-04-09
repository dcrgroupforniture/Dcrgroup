/**
 * Layout globale + Home Page
 */

const app = document.getElementById("app");
const backButton = document.getElementById("backButton");

const historyStack = [];

/* ===========================
   RENDER HOME
=========================== */
function renderHome() {
  app.innerHTML = `
    <section class="home">
      <div class="search-box">
        <input type="text" placeholder="Cerca cliente..." />
      </div>

      <div class="icon-grid">
        <div class="icon-card" data-route="clienti">
          <div class="icon clienti">👥</div>
          <span>Clienti</span>
        </div>

        <div class="icon-card" data-route="ordini-fornitori">
          <div class="icon ordini">📦</div>
          <span>Ordini Fornitori</span>
        </div>

        <div class="icon-card" data-route="listini">
          <div class="icon listini">💰</div>
          <span>Listini Prezzi</span>
        </div>

        <div class="icon-card" data-route="scadenze">
          <div class="icon scadenze">⏰</div>
          <span>Scadenze</span>
        </div>

        <div class="icon-card" data-route="spese">
          <div class="icon spese">💸</div>
          <span>Spese</span>
        </div>

        <div class="icon-card" data-route="incassi">
          <div class="icon incassi">💳</div>
          <span>Incassi</span>
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll(".icon-card").forEach(card => {
    card.addEventListener("click", () => navigate(card.dataset.route));
  });
}

/* ===========================
   ROUTER
=========================== */
function renderPage(route) {
  if (route === "home") {
    renderHome();
    return;
  }

  app.innerHTML = `
    <div class="card">
      <h2>${route}</h2>
      <p>Pagina in sviluppo.</p>
    </div>
  `;
}

function navigate(route) {
  if (historyStack.at(-1) !== route) {
    historyStack.push(route);
  }
  renderPage(route);
  updateBackButton();
}

function goBack() {
  historyStack.pop();
  const previous = historyStack.at(-1) || "home";
  renderPage(previous);
  updateBackButton();
}

function updateBackButton() {
  backButton.style.display = historyStack.length > 1 ? "flex" : "none";
}

/* ===========================
   EVENTI
=========================== */
document.querySelectorAll("[data-route]").forEach(btn => {
  btn.addEventListener("click", () => navigate(btn.dataset.route));
});

backButton.addEventListener("click", goBack);

/* ===========================
   START APP
=========================== */
navigate("home");
