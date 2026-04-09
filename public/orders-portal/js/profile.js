window.addEventListener('DOMContentLoaded', () => {
  const client = requireClient();
  if(!client) return;
  document.getElementById('companyName').textContent = client.companyName || client.name || '-';
  document.getElementById('email').textContent = client.email || '-';
  document.getElementById('discount').textContent = `${client.discountPercent || 0}%`;
  document.getElementById('logoutBtn').onclick = logout;
});
