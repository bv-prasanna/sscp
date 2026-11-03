/** SSCP enquiry endpoint - Cloudflare Pages Advanced Mode.
 *  Keeps API credentials server-side; serves all static pages via env.ASSETS.
 *  Email via Resend to Zoho inbox, with Turnstile human verification.
 */
const json = (data,status=200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'}});
const clean = (data,key,max) => typeof data[key]==='string' ? data[key].trim().slice(0,max) : '';
const esc = value => String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const validEmail = value => value.length <= 150 && /^[^\s@<>]+@[^\s@<>]+\.[a-zA-Z]{2,}$/.test(value);
const configured = env => Boolean(env.RESEND_API_KEY && env.RESEND_FROM && env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY);
const MAX_ATTACHMENT = 4*1024*1024; // bytes
const MAX_BODY = 5_900_000; // JSON incl. Base64 overhead
const interests=new Set(['Precision Leadframes','Semiconductor Solutions','Custom Requirements','Other Enquiry','Leadframe Plating','Request a Quotation']);
const platings=new Set(['','Silver','Nickel','Palladium','Gold','Tin','Other / to be discussed']);
const areas=new Set(['','Full frame — both sides','Full frame — one side','Selective / specific areas','To be discussed']);

function getAttachment(raw) {
  if (raw===null || raw===undefined) return null;
  if (!raw || typeof raw!=='object'||Array.isArray(raw)) throw new Error('Invalid attachment.');
  const filename = String(raw.name || '');
  const type = String(raw.type || '');
  const content = String(raw.content || '');
  const size = Number(raw.size);
  if (!Number.isSafeInteger(size) || size<1 || size>MAX_ATTACHMENT || content.length>Math.ceil(MAX_ATTACHMENT/3)*4+16)
    throw new Error('Drawing exceeds 4 MB. Please send large files directly to our email.');
  if (filename.length>100 || !/^[a-zA-Z0-9][a-zA-Z0-9 ._()-]*$/.test(filename))
    throw new Error('Please use a simple file name without special characters.');
  const ext=filename.toLowerCase().split('.').pop();
  const types={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
  if (types[ext]!==type) throw new Error('Only PDF, PNG and JPG drawings are accepted.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content) || content.length%4!==0) throw new Error('Invalid file encoding.');
  let magic;
  try { magic=atob(content.slice(0,64)); } catch { throw new Error('Invalid file encoding.'); }
  const headerOk=ext==='pdf'?magic.startsWith('%PDF-'):ext==='png'?magic.startsWith('\x89PNG\r\n\x1a\n'):magic.startsWith('\xff\xd8\xff');
  if (!headerOk) throw new Error('The drawing does not match its file type.');
  // Base64 payload must match binary byte size; prevents fake size metadata.
  const padding=(content.endsWith('==')?2:content.endsWith('=')?1:0);
  if (content.length*3/4-padding !== size) throw new Error('Invalid file size.');
  return {filename,content,content_type:type};
}

async function enquiry(request,env) {
  if (!configured(env)) return json({ok:false,message:'Online enquiry is not activated yet. Please use the email or WhatsApp buttons.'},503);
  // Same-site browser only. Direct API calls without Origin are rejected.
  let origin;
  try {origin=new URL(request.headers.get('Origin')||'');} catch {return json({ok:false,message:'Invalid submission origin.'},403);}
  const current=new URL(request.url);
  if (origin.protocol!=='https:'||origin.host!==current.host) return json({ok:false,message:'Invalid submission origin.'},403);
  if (!/^application\/json\b/i.test(request.headers.get('Content-Type')||'')) return json({ok:false,message:'Unsupported form encoding.'},415);
  if (Number(request.headers.get('Content-Length')||0)>MAX_BODY) return json({ok:false,message:'Your enquiry is too large. Please email the drawing directly.'},413);
  let d;
  try {const body=await request.text();if(body.length>MAX_BODY) return json({ok:false,message:'Your enquiry is too large. Please email the drawing directly.'},413);d=JSON.parse(body);}catch{return json({ok:false,message:'Invalid submission.'},400);}
  if (!d||typeof d!=='object'||Array.isArray(d))return json({ok:false,message:'Invalid submission.'},400);
  if (clean(d,'website',100)) return json({ok:true,message:'Thank you.'}); // honeypot
  // Reject invalid or oversized fields rather than silently truncate user data.
  for(const [key,max] of Object.entries({name:100,email:150,company:120,phone:30,interest:80,volume:80,plating:60,platingArea:80,message:3000})){
    if(d[key]!==undefined && (typeof d[key]!=='string'||d[key].length>max)) return json({ok:false,message:'Please check the length of the enquiry fields.'},422);
  }
  const fields={name:clean(d,'name',100),email:clean(d,'email',150),company:clean(d,'company',120),phone:clean(d,'phone',30),interest:clean(d,'interest',80),volume:clean(d,'volume',80),plating:clean(d,'plating',60),platingArea:clean(d,'platingArea',80),message:clean(d,'message',3000)};
  if (fields.name.length<2 || !validEmail(fields.email)||!interests.has(fields.interest)||fields.message.length<10 || !platings.has(fields.plating)||!areas.has(fields.platingArea)||d.consent!=='yes')
    return json({ok:false,message:'Please complete all required fields and accept the privacy notice.'},422);
  let attachment;
  try {attachment=getAttachment(d.attachment);} catch (e) {return json({ok:false,message:e.message},422);}
  const token=clean(d,'turnstileToken',2048);
  if (!token) return json({ok:false,message:'Please complete the security verification.'},422);
  let verified;
  try {
    const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:request.headers.get('CF-Connecting-IP')||undefined}),
      signal:AbortSignal.timeout(10000),
    });
    if(!response.ok) throw new Error('Verification HTTP error');
    verified=await response.json();
  }catch{return json({ok:false,message:'Human verification is temporarily unavailable. Please try again.'},503);}
  if(verified.success!==true || verified.hostname!==current.hostname || verified.action!=='sscp_enquiry')
    return json({ok:false,message:'Security verification expired or failed. Please retry.'},403);
  const rows=[['Name',fields.name],['Email',fields.email],['Company',fields.company],['Phone',fields.phone],['Interested in',fields.interest],['Estimated quantity',fields.volume],['Plating type',fields.plating],['Plating coverage',fields.platingArea],['Requirement',fields.message]];
  const html='<div style="font-family:Arial,sans-serif;color:#183957"><h2 style="color:#0b3871">New enquiry · SS Circuit Products</h2><p>Received through the company website.</p><table style="border-collapse:collapse;width:100%">'+rows.map(([label,value])=>`<tr><th style="text-align:left;padding:11px;background:#edf4fb;border-bottom:1px solid #dbe6f0">${esc(label)}</th><td style="padding:11px;border-bottom:1px solid #dbe6f0;white-space:pre-wrap">${esc(value||'—')}</td></tr>`).join('')+'</table><p style="color:#64788d">Please reply to this message to contact the enquirer.</p></div>';
  const text='New SSCP enquiry\n\n'+rows.map(([label,value])=>label+': '+(value||'—')).join('\n');
  const email={from:env.RESEND_FROM,to:['sales@sscircuitproducts.com'],reply_to:fields.email,subject:`SSCP enquiry — ${fields.interest}`,html,text};
  if (attachment) email.attachments=[attachment];
  try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.RESEND_API_KEY}`},body:JSON.stringify(email),signal:AbortSignal.timeout(20000)});
    if(!response.ok){console.error('SSCP Resend API status',response.status);return json({ok:false,message:'The email service could not accept the enquiry. Please email us directly.'},502);}
    const result=await response.json();
    if (!result?.id) return json({ok:false,message:'The email service did not confirm submission. Please retry.'},502);
    return json({ok:true,message:'Your enquiry has been sent to the SSCP sales team.'});
  }catch{return json({ok:false,message:'The email service is temporarily unavailable. Please retry or email us directly.'},503);}
}
export default {
  async fetch(request,env) {
    const pathname=new URL(request.url).pathname;
    if (pathname==='/api/enquiry/config') {
      if (request.method!=='GET') return json({ok:false,message:'Method not allowed.'},405);
      return json({configured:configured(env),siteKey:configured(env)?env.TURNSTILE_SITE_KEY:null});
    }
    if (pathname==='/api/enquiry') {
      if (request.method!=='POST') return json({ok:false,message:'Method not allowed.'},405);
      return enquiry(request,env);
    }
    return env.ASSETS.fetch(request);
  }
};
