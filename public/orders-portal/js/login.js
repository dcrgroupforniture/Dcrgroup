import { loginClient } from './firebase-portal.js';
window.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Accesso...';
    try {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value.trim();
      await loginClient(email, password);
      window.location.href = './index.html';
    } catch (err) {
      alert('Accesso non riuscito. Verifica email/password e l\'abilitazione cliente nel database.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entra';
    }
  });
});
