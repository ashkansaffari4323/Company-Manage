$ErrorActionPreference = "Stop"
if (!(Test-Path ".\client\src\main.jsx")) { throw "Run from repository root." }
if (!(Test-Path ".\api\index.js")) { throw "Missing api\index.js. Apply the single API package first." }

# Use /api/index explicitly so Vercel does not send /api to the SPA index.html rewrite.
$front = ".\client\src\main.jsx"
$c = Get-Content $front -Raw
$c = $c.Replace("/api?action=", "/api/index?action=")

# Add logout function immediately after connect function.
$connect = "async function connect(){const r=await axios.get('/api/index?action=auth-login');location.href=r.data.url}"
$logout = $connect + "async function logout(){try{await axios.post('/api/index?action=auth-logout');setConnected(false);setHubs([]);setHub('');location.href='/'}catch(e){setMessage(e.response?.data?.message||e.message)}}"
if ($c.Contains($connect) -and !$c.Contains("async function logout()")) {
    $c = $c.Replace($connect, $logout)
}

# Replace connection status block with Connect / Sign out behavior.
$old = "{!connected&&<button className=\"btn\" onClick={connect}><LogIn size={16}/>Connect</button>}"
$new = "{connected?<button className=\"btn secondary\" onClick={logout}>Sign out</button>:<button className=\"btn\" onClick={connect}><LogIn size={16}/>Connect Autodesk</button>}"
$c = $c.Replace($old, $new)
[IO.File]::WriteAllText((Resolve-Path $front), $c)

# Add auth-logout action to consolidated API before auth-status.
$api = ".\api\index.js"
$a = Get-Content $api -Raw
$target = "if(a==='auth-status')return res.json({authenticated:!!session(req)});"
$replacement = "if(a==='auth-logout'){res.setHeader('Set-Cookie','autodesk_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');return res.json({authenticated:false})}`r`n$target"
if ($a.Contains($target) -and !$a.Contains("a==='auth-logout'")) {
    $a = $a.Replace($target, $replacement)
}
[IO.File]::WriteAllText((Resolve-Path $api), $a)

# Ensure Vercel API function is reached directly and SPA routing remains after it.
$vercel = @'
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
[IO.File]::WriteAllText((Join-Path (Get-Location) "vercel.json"), $vercel)

Write-Host "Authentication fix applied."
Write-Host "API function count:" (Get-ChildItem .\api -Recurse -File -Filter *.js).Count
Write-Host "Frontend auth endpoint count:" ((Select-String -Path $front -Pattern "/api/index?action=" -AllMatches).Matches.Count)
