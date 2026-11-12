const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: {"Content-Type":"application/json; charset=utf-8", ...cors}
});
const now = () => new Date().toISOString();
function safeEmail(v){ const s=String(v||"").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:""; }
function emailSyntax(email){
  if(!email || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const [local,domain]=email.split('@');
  return local.length<=64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') && domain.length<=253 && domain.split('.').every(x=>x.length>0 && x.length<=63 && /^[a-z0-9-]+$/i.test(x) && !x.startsWith('-') && !x.endsWith('-'));
}
const disposableDomains=new Set([
  '10minutemail.com','10minutemail.net','guerrillamail.com','guerrillamail.net','mailinator.com',
  'tempmail.com','temp-mail.org','throwawaymail.com','yopmail.com','getnada.com','maildrop.cc',
  'trashmail.com','dispostable.com','sharklasers.com','grr.la','fakeinbox.com','mohmal.com',
  'minuteinbox.com','emailondeck.com','tempr.email','discard.email','mintemail.com'
]);
async function checkEmail(email){
  const clean=String(email||'').trim().toLowerCase();
  if(!emailSyntax(clean)) return {status:'invalid',note:'Email address syntax is invalid.'};
  const domain=clean.split('@')[1];
  if(disposableDomains.has(domain)) return {status:'risky',note:'Known disposable or temporary email domain.'};
  try{
    const endpoint='https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(domain)+'&type=MX';
    const response=await fetch(endpoint,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(5000)});
    if(!response.ok) return {status:'unknown',note:'DNS lookup service did not respond.'};
    const data=await response.json();
    if(data.Status===0 && (data.Answer||[]).some(x=>x.type===15)) return {status:'valid',note:'Domain publishes MX mail-routing records; mailbox existence is not confirmed.'};
    if(data.Status===0 && !(data.Answer||[]).some(x=>x.type===15)){
      const fallback=await fetch('https://cloudflare-dns.com/dns-query?name='+encodeURIComponent(domain)+'&type=A',{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(5000)});
      const a=await fallback.json().catch(()=>({}));
      if(a.Status===0 && (a.Answer||[]).some(x=>x.type===1)) return {status:'risky',note:'No MX record; domain has an A record and may use mail fallback. Manual review recommended.'};
      return {status:'invalid',note:'Domain has no MX mail server or usable A-record fallback.'};
    }
    if(data.Status===3) return {status:'invalid',note:'Domain does not exist (NXDOMAIN).'};
    return {status:'unknown',note:'DNS response was inconclusive.'};
  }catch(e){ return {status:'unknown',note:'DNS lookup timed out or was unavailable.'}; }
}
async function auth(req, env){
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  return !!env.APP_PASSWORD && token === env.APP_PASSWORD;
}
async function handle(req, env) {
  if(req.method==="OPTIONS") return new Response(null,{headers:cors});
  const url=new URL(req.url);
  if(url.pathname==="/api/health") return json({ok:true,app:"SmartSolz Lead Hunter",time:now()});
  if(url.pathname==="/api/unsubscribe" && req.method==="POST"){
    const {email}=await req.json().catch(()=>({}));
    const clean=safeEmail(email);
    if(!clean) return json({error:"Valid email required"},400);
    await env.DB.prepare("INSERT OR REPLACE INTO suppressions(email,reason) VALUES(?,?)").bind(clean,"Recipient request").run();
    await env.DB.prepare("UPDATE leads SET unsubscribed=1 WHERE lower(email)=?").bind(clean).run();
    return json({ok:true,message:"This address has been suppressed."});
  }
  if(!await auth(req,env)) return json({error:"Unauthorized. Set APP_PASSWORD and sign in."},401);
  if(url.pathname==="/api/verify-emails" && req.method==="POST"){
    const d=await req.json().catch(()=>({}));
    const ids=Array.isArray(d.ids)?d.ids.map(Number).filter(x=>Number.isInteger(x)&&x>0).slice(0,25):[];
    if(!ids.length) return json({error:'Provide 1–25 lead IDs.'},400);
    const marks=ids.map(()=>'?').join(',');
    const rows=await env.DB.prepare(`SELECT id,email FROM leads WHERE id IN (${marks}) AND email<>''`).bind(...ids).all();
    const results=await Promise.all((rows.results||[]).map(async row=>{
      const result=await checkEmail(row.email);
      await env.DB.prepare('UPDATE leads SET email_status=?,email_checked_at=?,email_check_note=? WHERE id=?')
        .bind(result.status,now(),result.note,row.id).run();
      return {id:row.id,email:row.email,...result};
    }));
    return json({ok:true,checked:results.length,results});
  }
  if(url.pathname==="/api/leads/unchecked" && req.method==="GET"){
    const rows=await env.DB.prepare("SELECT id FROM leads WHERE email<>'' AND email_status='unchecked' ORDER BY id LIMIT 25").all();
    return json(rows.results||[]);
  }
  if(url.pathname==="/api/leads" && req.method==="GET"){
    const q=(url.searchParams.get("q")||"").slice(0,100);
    const rows=await env.DB.prepare(`SELECT * FROM leads WHERE company LIKE ? OR email LIKE ? OR country LIKE ? OR industry LIKE ? ORDER BY id DESC LIMIT 500`)
      .bind(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`).all();
    return json(rows.results||[]);
  }
  if(url.pathname==="/api/leads" && req.method==="POST"){
    const d=await req.json().catch(()=>({}));
    const company=String(d.company||"").trim();
    const email=String(d.email||"").trim().toLowerCase();
    if(!company) return json({error:"Company is required"},400);
    let consent=["verified","unverified","not_applicable"].includes(d.consent_status)?d.consent_status:"unverified";
    const basis=String(d.consent_basis||"").trim();
    if(consent==="verified" && !basis) consent="unverified";
    try{
      const result=await env.DB.prepare(`INSERT INTO leads(first_name,last_name,company,title,email,phone,website,country,industry,source_url,consent_status,consent_basis,consent_date,notes,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        String(d.first_name||""),String(d.last_name||""),company,String(d.title||""),email,
        String(d.phone||""),String(d.website||""),String(d.country||""),String(d.industry||""),
        String(d.source_url||""),consent,basis,String(d.consent_date||""),String(d.notes||""),now()
      ).run();
      return json({ok:true,id:result.meta.last_row_id});
    }catch(e){return json({error:"Could not save lead. The email may already exist."},409);}
  }
  if(url.pathname==="/api/leads/export" && req.method==="GET"){
    const rows=await env.DB.prepare("SELECT first_name,last_name,company,title,email,phone,website,country,industry,source_url,consent_status,consent_basis,consent_date,notes,unsubscribed,email_status,email_checked_at,email_check_note FROM leads ORDER BY id").all();
    const cols=Object.keys(rows.results[0]||{first_name:""});
    const esc=x=>'"'+String(x??"").replace(/"/g,'""')+'"';
    const csv=[cols.join(","),...(rows.results||[]).map(r=>cols.map(k=>esc(r[k])).join(","))].join("\r\n");
    return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=smartsolz-leads.csv",...cors}});
  }
  if(url.pathname==="/api/leads/import" && req.method==="POST"){
    const {rows=[]}=await req.json().catch(()=>({}));
    if(!Array.isArray(rows)||rows.length>500) return json({error:"Import up to 500 rows per batch."},400);
    let added=0, skipped=0;
    for(const d of rows){
      const company=String(d.company||"").trim(), email=String(d.email||"").trim().toLowerCase();
      if(!company||!email){skipped++;continue;}
      let consent=["verified","unverified","not_applicable"].includes(d.consent_status)?d.consent_status:"unverified";
      const basis=String(d.consent_basis||"").trim(); if(consent==="verified"&&!basis)consent="unverified";
      try{
        await env.DB.prepare(`INSERT INTO leads(first_name,last_name,company,title,email,phone,website,country,industry,source_url,consent_status,consent_basis,consent_date,notes,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(String(d.first_name||""),String(d.last_name||""),company,String(d.title||""),email,String(d.phone||""),String(d.website||""),String(d.country||""),String(d.industry||""),String(d.source_url||""),consent,basis,String(d.consent_date||""),String(d.notes||""),now()).run();
        added++;
      }catch{skipped++;}
    }
    return json({ok:true,added,skipped});
  }
  if(url.pathname==="/api/leads/" && req.method==="DELETE"){
    const id=Number(url.searchParams.get("id"));
    if(!Number.isInteger(id))return json({error:"Invalid id"},400);
    await env.DB.prepare("DELETE FROM leads WHERE id=?").bind(id).run(); return json({ok:true});
  }
  if(url.pathname==="/api/campaigns" && req.method==="GET"){
    const rows=await env.DB.prepare("SELECT * FROM campaigns ORDER BY id DESC").all(); return json(rows.results||[]);
  }
  if(url.pathname==="/api/campaigns" && req.method==="POST"){
    const d=await req.json().catch(()=>({}));
    if(!d.name||!d.subject||!d.body)return json({error:"Name, subject and body required"},400);
    const r=await env.DB.prepare("INSERT INTO campaigns(name,subject,body,status) VALUES(?,?,?,'draft')").bind(String(d.name),String(d.subject),String(d.body)).run();
    return json({ok:true,id:r.meta.last_row_id});
  }
  if(url.pathname==="/api/stats"){
    const a=await env.DB.prepare("SELECT COUNT(*) n FROM leads").first();
    const v=await env.DB.prepare("SELECT COUNT(*) n FROM leads WHERE consent_status='verified' AND unsubscribed=0").first();
    const c=await env.DB.prepare("SELECT COUNT(*) n FROM campaigns").first();
    const s=await env.DB.prepare("SELECT COUNT(*) n FROM sends WHERE status='sent'").first();
    return json({leads:a.n,verified:v.n,campaigns:c.n,sent:s.n});
  }
  return json({error:"Not found"},404);
}
export default { async fetch(req,env){ try{return await handle(req,env);}catch(e){return json({error:"Server error",detail:String(e.message||e)},500);} } };
