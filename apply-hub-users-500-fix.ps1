$ErrorActionPreference = 'Stop'
if (!(Test-Path '.\api\index.js')) { throw 'Run from repository root. Missing api\index.js.' }
if (!(Test-Path '.\client\src\main.jsx')) { throw 'Run from repository root. Missing client\src\main.jsx.' }

$apiPath = '.\api\index.js'
$api = Get-Content $apiPath -Raw

# Remove either old account-users or an earlier account-users-page implementation.
$api = [regex]::Replace($api, "if\(action==='account-users(?:-page)?'\)\{[\s\S]*?(?=if\(action==='user-projects'\))", '', 1)

$newApi = @'
if(action==='account-users-page'){const t=await appToken('account:read'),aid=account(req.query.hubId),requested=Math.min(Math.max(Number(req.query.limit||500),1),500),offset=Math.max(Number(req.query.offset||0),0);let r,usedLimit=requested;try{r=await axios.get(`${APS}/hq/v1/accounts/${aid}/users?limit=${requested}&offset=${offset}`,{headers:{Authorization:`Bearer ${t}`}})}catch(e){if(e.response?.status===400&&requested>200){usedLimit=200;r=await axios.get(`${APS}/hq/v1/accounts/${aid}/users?limit=200&offset=${offset}`,{headers:{Authorization:`Bearer ${t}`}})}else throw e}const source=r.data.results||r.data.users||r.data||[],batch=Array.isArray(source)?source:[],total=r.data.pagination?.totalResults||r.data.total||batch.length;return res.json({limit:usedLimit,offset,total,nextOffset:offset+batch.length,hasMore:offset+batch.length<total,users:batch.map(u=>({id:u.id,name:u.name||`${u.first_name||u.firstName||''} ${u.last_name||u.lastName||''}`.trim(),email:u.email||'',status:u.status||'',companyName:u.company_name||u.companyName||u.company?.name||'',companyId:u.company_id||u.companyId||u.company?.id||''}))})}
'@

$marker = "if(action==='user-projects')"
if (!$api.Contains($marker)) { throw 'The user-projects route was not found in api\index.js.' }
$api = $api.Replace($marker, $newApi.Trim() + "`n" + $marker)
[IO.File]::WriteAllText((Resolve-Path $apiPath), $api)

$frontPath = '.\client\src\main.jsx'
$front = Get-Content $frontPath -Raw

# Ensure the hub-user queue state exists.
if (!$front.Contains('[userQueue,setUserQueue]')) {
    $front = $front.Replace("[removeUserText,setRemoveUserText]=useState('')", "[removeUserText,setRemoveUserText]=useState(''),[userQueue,setUserQueue]=useState(null)")
}

# Replace the complete loadAccountUsers function regardless of minification.
$newFunction = @'
async function loadAccountUsers(){let offset=0,total=0,loaded=[],pending=[];setUserQueue({loaded:0,total:0,pending:0,status:'Loading'});setMessage('');do{try{const r=await axios.get(API+'account-users-page&hubId='+encodeURIComponent(hub)+'&limit=500&offset='+offset),batch=r.data.users||[];loaded.push(...batch);total=r.data.total||loaded.length;offset=r.data.nextOffset||offset+batch.length;setUserQueue({loaded:loaded.length,total,pending:pending.length,status:'Loading'});if(r.data.hasMore)await wait(5000);else break}catch(e){if(retryable(e)){pending.push(offset);offset+=500;setUserQueue({loaded:loaded.length,total,pending:pending.length,status:'Pending retry'});await wait(5000)}else{setMessage(e.response?.data?.message||e.message);break}}}while(!total||offset<total);for(const retryOffset of [...pending]){try{await wait(5000);const r=await axios.get(API+'account-users-page&hubId='+encodeURIComponent(hub)+'&limit=500&offset='+retryOffset);loaded.push(...(r.data.users||[]));pending=pending.filter(x=>x!==retryOffset)}catch(e){}}loaded=[...new Map(loaded.map(u=>[u.id,u])).values()];setAccountUsers(loaded);setUserQueue({loaded:loaded.length,total:total||loaded.length,pending:pending.length,status:pending.length?'Completed with pending':'Completed'})}
'@
$front = [regex]::Replace($front, "async function loadAccountUsers\(\)\{[\s\S]*?(?=async function loadSelectedUserProjects)", $newFunction.Trim(), 1)

# Add a visible queue status above the user selector if not already present.
if (!$front.Contains('Hub users queue:')) {
    $open = "{page==='user'&&<><div className=\"card\">"
    $withQueue = "{page==='user'&&<>{userQueue&&<div className=\"notice\"><b>Hub users queue:</b> {userQueue.status} | Loaded {userQueue.loaded} of {userQueue.total} | Pending {userQueue.pending} | Up to 500 users per request, 5-second gap, pending retry at end.</div>}<div className=\"card\">"
    $front = $front.Replace($open, $withQueue)
}
[IO.File]::WriteAllText((Resolve-Path $frontPath), $front)

Write-Host 'Hub users endpoint and smart queue fixed.' -ForegroundColor Green
Write-Host 'Account users endpoint: /hq/v1/accounts/{accountId}/users'
Write-Host 'Token: two-legged account:read'
Write-Host 'Batch target: 500, automatic fallback to 200 if Autodesk rejects 500'
Write-Host 'Gap: 5 seconds, pending retry at end'
Write-Host 'API function count:' (Get-ChildItem '.\api' -Recurse -File -Filter '*.js').Count
