let token=localStorage.getItem("slh_token")||"";
const $=id=>document.getElementById(id);
function toast(msg,err=false){const t=$("toast");t.textContent=msg;t.className=err?"show error":"show";setTimeout(()=>t.className="",4000)}
async function api(path,opts={}){const headers={...(opts.headers||{}),"Authorization":"Bearer "+token};if(opts.body)headers["Content-Type"]="application/json";const r=await fetch(path,{...opts,headers});const d=opts.raw? r : await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||("HTTP "+r.status));return d}
function showTab(tab){document.querySelectorAll(".tab").forEach(x=>x.hidden=true);$(tab).hidden=false;document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.tab===tab));$("pageTitle").textContent=({dashboard:"Dashboard",leads:"Lead database",campaigns:"Email campaigns",settings:"Settings"})[tab];if(tab==="dashboard")loadStats();if(tab==="leads")loadLeads();if(tab==="campaigns")loadCampaigns()}
async function enter(){try{await api("/api/health");$("login").hidden=true;$("app").hidden=false;showTab("dashboard")}catch(e){$("loginMsg").textContent=e.message}}
$("loginBtn").onclick=async()=>{token=$("password").value;localStorage.setItem("slh_token",token);try{const r=await fetch("/api/stats",{headers:{Authorization:"Bearer "+token}});if(!r.ok)throw Error("Incorrect password or API unavailable");$("loginMsg").textContent="";enter()}catch(e){$("loginMsg").textContent=e.message}};
$("logout").onclick=()=>{localStorage.removeItem("slh_token");token="";location.reload()};
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
async function loadStats(){try{const s=await api("/api/stats");$("statLeads").textContent=s.leads;$("statVerified").textContent=s.verified;$("statCampaigns").textContent=s.campaigns;$("statSent").textContent=s.sent}catch(e){toast(e.message,true)}}
async function loadLeads(){try{const rows=await api("/api/leads?q="+encodeURIComponent($("search").value||""));$("leadRows").innerHTML=rows.map(x=>`<tr><td><b>${esc(x.company)}</b><small>${esc(x.website||"")}</small></td><td>${esc((x.first_name+" "+x.last_name).trim())}<small>${esc(x.email)}</small></td><td>${esc(x.country||"—")}</td><td>${esc(x.industry||"—")}</td><td><span class="tag ${esc(x.email_status||"unchecked")}">${esc((x.email_status||"unchecked").toUpperCase())}</span><small>${esc(x.email_check_note||"Not checked yet")}</small></td><td><span class="tag ${esc(x.consent_status)}">${esc(x.consent_status)}</span>${x.unsubscribed?"<small>Suppressed</small>":""}</td><td><button class="link" data-del="${x.id}">Delete</button></td></tr>`).join("")||'<tr><td colspan="7">No leads found.</td></tr>';document.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this lead?")){await api("/api/leads/?id="+b.dataset.del,{method:"DELETE"});loadLeads()}})}catch(e){toast(e.message,true)}}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("searchBtn").onclick=loadLeads;
async function verifyUnchecked(showMessage=true){
  const btn=$("verifyBtn"); if(btn)btn.disabled=true;
  let total=0;
  try{
    while(true){
      const pending=await api("/api/leads/unchecked");
      if(!pending.length)break;
      const result=await api("/api/verify-emails",{method:"POST",body:JSON.stringify({ids:pending.map(x=>x.id)})});
      total+=result.checked;
      if(total>=500)break;
    }
    if(showMessage)toast(`Email domain checks completed: ${total}`);
    await loadLeads();
  }catch(err){toast("Verification issue: "+err.message,true)}
  finally{if(btn)btn.disabled=false}
}
$("verifyBtn").onclick=()=>verifyUnchecked(true);
$("leadForm").onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await api("/api/leads",{method:"POST",body:JSON.stringify(d)});e.target.reset();toast("Lead saved; checking email domain...");loadLeads();loadStats();verifyUnchecked(false)}catch(err){toast(err.message,true)}};
function parseCSV(text){const lines=text.replace(/\r/g,"").split("\n").filter(Boolean);if(!lines.length)return[];const parse=line=>{let a=[],v="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'&&q){v+='"';i++}else if(c==='"')q=!q;else if(c===","&&!q){a.push(v);v=""}else v+=c}a.push(v);return a};const h=parse(lines.shift()).map(x=>x.trim());return lines.map(l=>Object.fromEntries(parse(l).map((v,i)=>[h[i],v])))}
$("importBtn").onclick=async()=>{const f=$("csvFile").files[0];if(!f){toast("Choose a CSV file",true);return}try{const rows=parseCSV(await f.text());let r=await api("/api/leads/import",{method:"POST",body:JSON.stringify({rows})});toast(`Imported ${r.added}; skipped ${r.skipped}. Starting free email checks...`);loadLeads();loadStats();verifyUnchecked(false)}catch(e){toast(e.message,true)}};
$("exportBtn").onclick=async()=>{try{const r=await fetch("/api/leads/export",{headers:{Authorization:"Bearer "+token}});if(!r.ok)throw Error("Export failed");const blob=await r.blob(),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="smartsolz-leads.csv";a.click();URL.revokeObjectURL(a.href)}catch(e){toast(e.message,true)}};
$("campaignForm").onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await api("/api/campaigns",{method:"POST",body:JSON.stringify(d)});e.target.reset();toast("Draft saved");loadCampaigns()}catch(err){toast(err.message,true)}};
async function loadCampaigns(){try{const rows=await api("/api/campaigns");$("campaignRows").innerHTML=rows.map(x=>`<div class="campaign"><b>${esc(x.name)}</b><small>${esc(x.subject)} · ${esc(x.status)} · ${esc(x.created_at)}</small></div>`).join("")||"No drafts yet."}catch(e){toast(e.message,true)}}
if(token){enter()}
