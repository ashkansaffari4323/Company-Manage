$ErrorActionPreference = 'Stop'
if (!(Test-Path '.\client\src\main.jsx')) { throw 'Run from repository root.' }
if (!(Test-Path '.\api\index.js')) { throw 'Missing api\index.js.' }
Copy-Item '.\replacement\index.js' '.\api\index.js' -Force
$p='.\client\src\main.jsx'; $c=Get-Content $p -Raw
$c=$c.Replace("['projects','All Projects',FolderKanban]", "['access','Users & Access',Users]")
$c=$c.Replace("projects:['All Projects','Projects visible to the signed-in Hub Admin, including active, archived, and templates.']", "access:['Users & Access','Select projects, select multiple users, then change roles or remove project access.']")
$c=$c.Replace("[projects,setProjects]=useState([]),[projectSearch,setProjectSearch]=useState('')", "[projects,setProjects]=useState([]),[projectSearch,setProjectSearch]=useState(''),[accessProject,setAccessProject]=useState(''),[projectUsers,setProjectUsers]=useState([]),[selectedUsers,setSelectedUsers]=useState([]),[roleValue,setRoleValue]=useState('')")
# checkbox filters apply immediately after first directory load
$anchor="async function uploadCompanyImage"
$effect="useEffect(()=>{if(page==='companies'&&companyMeta.totalAll>0)loadCompanies()},[companyFilters.noErp,companyFilters.noTax,companyFilters.noMembers,companyFilters.status]);"
if(!$c.Contains($effect)){$c=$c.Replace($anchor,$effect+$anchor)}
# add access functions before preview purge
$needle='async function previewPurge()'
$functions=@'
async function loadProjectUsers(){if(!accessProject)return;try{const r=await axios.get('/api/index?action=project-users&projectId='+encodeURIComponent(accessProject));setProjectUsers(r.data.users||[]);setSelectedUsers([])}catch(e){setMessage(e.response?.data?.message||e.message)}}async function bulkUpdateRoles(){if(!selectedUsers.length||!roleValue.trim())return;try{await axios.post('/api/index?action=project-users-bulk',{projectId:accessProject,userIds:selectedUsers,operation:'role',role:roleValue.trim()});await loadProjectUsers()}catch(e){setMessage(e.response?.data?.message||e.message)}}async function bulkRemoveUsers(){if(!selectedUsers.length||!confirm('Remove selected users from this project?'))return;try{await axios.post('/api/index?action=project-users-bulk',{projectId:accessProject,userIds:selectedUsers,operation:'remove'});await loadProjectUsers()}catch(e){setMessage(e.response?.data?.message||e.message)}}
'@
if(!$c.Contains('async function loadProjectUsers()')){$c=$c.Replace($needle,$functions.Trim()+$needle)}
# remove All Projects page and replace with Users & Access
$pattern="\{page==='projects'&&<section[\s\S]*?</section>\}"
$access=@'
{page==='access'&&<><section className="card"><div className="toolbar"><div><h3>Project User Access Manager</h3><p className="muted small">Load projects, choose one project, then select multiple users to update a role or remove access. Autodesk permissions of the signed-in Hub Admin still apply.</p></div><button className="btn right" onClick={loadProjects}><RefreshCw size={16}/>Load Projects</button></div><div className="toolbar"><select className="select grow" value={accessProject} onChange={e=>setAccessProject(e.target.value)}><option value="">Select a project</option>{projects.filter(p=>normal(p.name).includes(normal(projectSearch))).map(p=><option key={p.id} value={p.id}>{p.name} | {p.status} | {p.classification}</option>)}</select><input className="input" placeholder="Filter projects" value={projectSearch} onChange={e=>setProjectSearch(e.target.value)}/><button className="btn" disabled={!accessProject} onClick={loadProjectUsers}><Users size={16}/>Load Users</button></div><div className="toolbar"><label className="checks"><input type="checkbox" checked={projectUsers.length>0&&selectedUsers.length===projectUsers.length} onChange={e=>setSelectedUsers(e.target.checked?projectUsers.map(u=>u.id):[])}/>Select all users</label><span className="badge">{selectedUsers.length} selected</span><input className="input right" placeholder="New role name or role ID" value={roleValue} onChange={e=>setRoleValue(e.target.value)}/><button className="btn" disabled={!selectedUsers.length||!roleValue.trim()} onClick={bulkUpdateRoles}>Change Role</button><button className="btn danger" disabled={!selectedUsers.length} onClick={bulkRemoveUsers}>Remove Access</button><button className="btn secondary" disabled={!projectUsers.length} onClick={()=>exportExcel('Project_Users.xlsx',projectUsers)}>Export Excel</button></div><SimpleTable columns={['Select','Name','Email','Company','Roles','Status']} rows={projectUsers.map(u=>[<input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={()=>setSelectedUsers(selectedUsers.includes(u.id)?selectedUsers.filter(x=>x!==u.id):[...selectedUsers,u.id])}/>,u.name||u.email,u.email,u.companyName||'',Array.isArray(u.roles)?u.roles.map(r=>r.name||r).join(', '):(u.role||''),<span className="badge">{u.status||'active'}</span>])} empty="Load projects, select one project, then load users."/></section><section className="notice"><Info size={18} style={{verticalAlign:'middle',marginRight:8}}/>Project deletion is not included because Autodesk's current Forma Project Admin API does not provide a project-delete endpoint. User write actions work for supported Forma/ACC projects and are not compatible with BIM 360 project writes.</section></>}
'@
$c=[regex]::Replace($c,$pattern,$access.Trim())
# make company filter button clearer
$c=$c.Replace("'Apply & Load All'", "'Reload All Companies'")
[IO.File]::WriteAllText((Resolve-Path $p),$c)
Write-Host 'Access Manager patch applied.' -ForegroundColor Green
Write-Host 'API function count:' (Get-ChildItem .\api -Recurse -File -Filter '*.js').Count
Write-Host 'Next: git add --all; git commit -m "Add company filters and user access manager"; git push origin main'
