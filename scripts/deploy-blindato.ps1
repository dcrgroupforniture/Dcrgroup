$ErrorActionPreference = "Stop"

Write-Host "[1/4] Verifica working tree pulita..."
if (git status --porcelain) {
  Write-Error "Working tree non pulita. Commit/stash prima del deploy."
}

Write-Host "[2/4] Sync root -> public (*.html,*.css,*.js)..."
$files = git ls-files | Where-Object { $_ -notmatch '^public/' -and $_ -match '\.(html|css|js)$' }
foreach ($f in $files) {
  $pf = "public/$f"
  if (Test-Path $pf) {
    $h1 = (Get-FileHash $f -Algorithm SHA256).Hash
    $h2 = (Get-FileHash $pf -Algorithm SHA256).Hash
    if ($h1 -ne $h2) {
      Copy-Item $f $pf -Force
      Write-Host "sync: $f -> $pf"
    }
  }
}

Write-Host "[3/4] Commit sync public (se serve)..."
if (git status --porcelain) {
  git add public
  git commit -m "chore(deploy): sync public mirror before hosting deploy"
}

Write-Host "[4/4] Deploy hosting..."
firebase deploy --only hosting
Write-Host "[OK] Deploy completato."
