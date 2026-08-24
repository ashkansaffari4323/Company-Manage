$ErrorActionPreference = 'Stop'
if (!(Test-Path '.\api\index.js')) { throw 'Run this script from the repository root. Missing api\index.js.' }

$p = '.\api\index.js'
$c = Get-Content $p -Raw

$oldStart = "if(a==='company-projects'){const t=await userToken(req),aid=account(req.query.hubId),companyId=req.query.companyId,detail=await axios.get(`${APS}/hq/v1/accounts/${aid}/companies/${companyId}`,{headers:{Authorization:`Bearer ${t}`}}),d=detail.data||{}"
$newStart = "if(a==='company-projects'){const userT=await userToken(req),appT=await appToken('account:read'),aid=account(req.query.hubId),companyId=req.query.companyId,detail=await axios.get(`${APS}/hq/v1/accounts/${aid}/companies/${companyId}`,{headers:{Authorization:`Bearer ${appT}`}}),d=detail.data||{}"

if (!$c.Contains($oldStart)) {
    throw 'The expected company-projects route was not found. Make sure you are using the latest project-audit ZIP.'
}

$c = $c.Replace($oldStart, $newStart)
$c = $c.Replace('const projects=await pages(`${APS}/construction/admin/v1/accounts/${aid}/projects`,t),matches=[]', 'const projects=await pages(`${APS}/construction/admin/v1/accounts/${aid}/projects`,userT),matches=[]')

# Only update the project-user request inside company-projects.
$projectStart = $c.IndexOf("if(a==='company-projects')")
$projectEnd = $c.IndexOf("if(a==='company-update')", $projectStart)
$segment = $c.Substring($projectStart, $projectEnd - $projectStart)
$segment = $segment.Replace('headers:{Authorization:`Bearer ${t}`}}),batch=r.data.results||[]', 'headers:{Authorization:`Bearer ${userT}`}}),batch=r.data.results||[]')
$c = $c.Substring(0, $projectStart) + $segment + $c.Substring($projectEnd)

[System.IO.File]::WriteAllText((Resolve-Path $p), $c)

Write-Host 'Company project association authentication fixed.' -ForegroundColor Green
Write-Host 'HQ company detail: two-legged account:read token'
Write-Host 'Projects and project users: signed-in user token'
Write-Host 'API function count:' (Get-ChildItem '.\api' -Recurse -File -Filter '*.js').Count
Write-Host 'Next: git add --all; git commit -m "Fix company project audit token context"; git push origin main'
