$ErrorActionPreference = "Stop"
$root = Get-Location
if (!(Test-Path ".\client\src\main.jsx")) { throw "Run this script from the repository root." }
if (!(Test-Path ".\lib\_lib.js")) { throw "Missing lib\_lib.js" }
Remove-Item ".\api" -Recurse -Force -ErrorAction SilentlyContinue
New-Item ".\api" -ItemType Directory | Out-Null
Copy-Item ".\single-api\index.js" ".\api\index.js" -Force
$p = ".\client\src\main.jsx"
$c = Get-Content $p -Raw
$map = @{
"/api/auth/callback?code="="/api?action=auth-callback&code=";
"/api/auth/status"="/api?action=auth-status";
"/api/auth/login"="/api?action=auth-login";
"/api/hubs"="/api?action=hubs";
"/api/companies/existing?hubId="="/api?action=companies-existing&hubId=";
"/api/companies/import-batch"="/api?action=companies-import-batch";
"/api/companies/list?"="/api?action=companies-list&";
"/api/companies/manage?hubId="="/api?action=companies-manage&hubId=";
"/api/companies/manage"="/api?action=companies-manage";
"/api/projects?hubId="="/api?action=projects&hubId=";
"/api/companies/purge"="/api?action=companies-purge"
}
foreach($k in $map.Keys){$c=$c.Replace($k,$map[$k])}
[IO.File]::WriteAllText((Resolve-Path $p),$c)
Write-Host "Applied. API function count:" (Get-ChildItem .\api -Recurse -File -Filter *.js).Count
Write-Host "Now run: git add --all; git commit -m 'Consolidate backend to one Vercel function'; git push origin main"
