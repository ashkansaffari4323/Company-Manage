$ErrorActionPreference = 'Stop'

if (-not (Test-Path '.\client\src\main.jsx')) {
    throw 'Run this script from the repository root.'
}

if (-not (Test-Path '.\api\index.js')) {
    throw 'Missing api\index.js. Apply the single API package first.'
}

$front = '.\client\src\main.jsx'
$content = Get-Content $front -Raw

# Route every frontend API call directly to the single Vercel function.
$content = $content.Replace('/api?action=', '/api/index?action=')

# Add the logout function after the existing connect function.
$connectFunction = @'
async function connect(){const r=await axios.get('/api/index?action=auth-login');location.href=r.data.url}
'@

$connectAndLogoutFunctions = @'
async function connect(){try{const r=await axios.get('/api/index?action=auth-login');if(!r.data?.url)throw new Error('Autodesk login URL was not returned. Check Vercel APS environment variables.');location.href=r.data.url}catch(e){setMessage(e.response?.data?.message||e.message)}}async function logout(){try{await axios.post('/api/index?action=auth-logout');setConnected(false);setHubs([]);setHub('');location.href='/'}catch(e){setMessage(e.response?.data?.message||e.message)}}
'@

if ($content.Contains($connectFunction.Trim()) -and -not $content.Contains('async function logout()')) {
    $content = $content.Replace($connectFunction.Trim(), $connectAndLogoutFunctions.Trim())
}

# Replace the old Connect-only button with Connect Autodesk / Sign out.
$oldButton = @'
{!connected&&<button className="btn" onClick={connect}><LogIn size={16}/>Connect</button>}
'@

$newButton = @'
{connected?<button className="btn secondary" onClick={logout}>Sign out</button>:<button className="btn" onClick={connect}><LogIn size={16}/>Connect Autodesk</button>}
'@

$content = $content.Replace($oldButton.Trim(), $newButton.Trim())
[System.IO.File]::WriteAllText((Resolve-Path $front), $content)

# Add logout handling to the single API function.
$apiFile = '.\api\index.js'
$apiContent = Get-Content $apiFile -Raw
$authStatus = "if(a==='auth-status')return res.json({authenticated:!!session(req)});"
$authLogout = "if(a==='auth-logout'){res.setHeader('Set-Cookie','autodesk_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');return res.json({authenticated:false})}`r`n$authStatus"

if ($apiContent.Contains($authStatus) -and -not $apiContent.Contains("a==='auth-logout'")) {
    $apiContent = $apiContent.Replace($authStatus, $authLogout)
}
[System.IO.File]::WriteAllText((Resolve-Path $apiFile), $apiContent)

# Make /api and /api/index resolve before the SPA fallback.
$vercelConfig = @'
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "client/dist",
  "rewrites": [
    { "source": "/api", "destination": "/api/index" },
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
'@
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'vercel.json'), $vercelConfig)

$apiCount = (Get-ChildItem '.\api' -Recurse -File -Filter '*.js').Count
$endpointCount = (Select-String -Path $front -Pattern '/api/index?action=' -AllMatches).Matches.Count

Write-Host 'Authentication fix applied successfully.' -ForegroundColor Green
Write-Host "API function count: $apiCount"
Write-Host "Frontend single-API endpoint references: $endpointCount"
Write-Host ''
Write-Host 'Next commands:' -ForegroundColor Cyan
Write-Host 'git add --all'
Write-Host 'git commit -m "Fix Autodesk login and add sign out"'
Write-Host 'git push origin main'
