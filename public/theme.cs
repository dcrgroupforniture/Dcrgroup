:root {
  --bg: #1f4fd8;
  --card: rgba(255,255,255,0.12);
  --card-hover: rgba(255,255,255,0.2);
  --text: #ffffff;
  --input-bg: rgba(255,255,255,0.15);
}

body.light {
  --bg: #f2f4f8;
  --card: #ffffff;
  --card-hover: #e8ecf5;
  --text: #1a1a1a;
  --input-bg: #ffffff;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  transition: background 0.3s, color 0.3s;
}

/* elementi comuni */
input, select, textarea {
  background: var(--input-bg);
  color: var(--text);
  border: 1px solid rgba(255,255,255,0.2);
}

button {
  background: #2c7be5;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
}
