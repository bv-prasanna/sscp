import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const worker=(await import(pathToFileURL(path.resolve(import.meta.dirname,'../_worker.js')))).default;
const env={RESEND_API_KEY:'test-key',RESEND_FROM:'SSCP Website <enquiries@notify.sscircuitproducts.com>',TURNSTILE_SECRET_KEY:'test-secret',TURNSTILE_SITE_KEY:'test-site',ASSETS:{fetch:async()=>new Response('static asset')}};
const host='https://sscp.pages.dev';
const valid={name:'Nitin Engineer',email:'nitin@example.com',company:'Customer Inc.',phone:'+911234567890',interest:'Leadframe Plating',volume:'10000',plating:'Silver',platingArea:'Selective / specific areas',message:'Quotation for 10x10 88-pin QFN leadframe plating, one side.',consent:'yes',website:'',turnstileToken:'token'};
const call=async (endpoint,method='GET',body=null,headers={},envOverride=env)=>worker.fetch(new Request(host+endpoint,{method,headers:method==='POST'?{'Origin':host,'Content-Type':'application/json',...headers}:headers,body:body===null?undefined:JSON.stringify(body)}),envOverride);
let count=0;
function check(ok,message){assert.ok(ok,message); count++;}
let result=await call('/api/enquiry/config');check(result.status===200,'config 200');check((await result.json()).configured===true,'config ready');
result=await call('/api/enquiry/config','GET',null,{}, {...env,RESEND_API_KEY:''});check((await result.json()).configured===false,'config not ready');
result=await call('/styles.css');check(await result.text()==='static asset','asset fallback');
result=await call('/api/enquiry','GET');check(result.status===405,'method restrictions');
result=await call('/api/enquiry','POST',valid,{'Origin':'https://evil.example'});check(result.status===403,'origin mismatch');
result=await call('/api/enquiry','POST',{...valid,consent:'no'});check(result.status===422,'consent mandatory');
result=await call('/api/enquiry','POST',{...valid,email:'invalid'});check(result.status===422,'email validation');
result=await call('/api/enquiry','POST',{...valid,interest:'Other fake'});check(result.status===422,'interest validation');
result=await call('/api/enquiry','POST',{...valid,website:'bot.website'});check(result.status===200,'spam honeypot');
result=await call('/api/enquiry','POST',{...valid,attachment:{name:'evil.exe',type:'application/octet-stream',size:100,content:'YQ=='}});check(result.status===422,'attachment rejects executable');
result=await call('/api/enquiry','POST',{...valid,attachment:{name:'drawing.pdf',type:'application/pdf',size:102,content:'ZmFrZQ=='}});check(result.status===422,'attachment rejects fake PDF');
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<</Type /Catalog>>\nendobj\n%%EOF');
const attachment={name:'QFN-88pin.pdf',type:'application/pdf',size:pdf.length,content:pdf.toString('base64')};
let verificationCalls=0,sendCalls=0,sent=null;
const savedFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(String(url).includes('siteverify')){verificationCalls++;return Response.json({success:true,hostname:'sscp.pages.dev',action:'sscp_enquiry'});}
  if(String(url).includes('api.resend.com')){sendCalls++;sent=JSON.parse(options.body);return Response.json({id:'em_test_0001'});}
  throw new Error('Unexpected URL '+url);
};
try {
 result=await call('/api/enquiry','POST',{...valid,attachment});check(result.status===200,'send with attachment success');check((await result.json()).ok===true,'success response');
 check(verificationCalls===1,'turnstile verified');check(sendCalls===1,'email submitted');
 check(sent.to[0]==='sales@sscircuitproducts.com','correct recipient');check(sent.reply_to==='nitin@example.com','correct reply-to');
 check(sent.attachments[0].filename==='QFN-88pin.pdf','PDF attachment sent');
 check(sent.text.includes('Selective / specific areas'),'plating coverage preserved');
 result=await call('/api/enquiry','POST',{...valid,attachment:null});check(result.status===200,'send without attachment');
 check(sendCalls===2,'second email sent');
 globalThis.fetch=async(url,options)=>String(url).includes('siteverify')?Response.json({success:true,hostname:'evil.example',action:'sscp_enquiry'}):Response.json({id:'should-not-send'});
 result=await call('/api/enquiry','POST',valid);check(result.status===403,'turnstile hostname mismatch');
 globalThis.fetch=async(url,options)=>String(url).includes('siteverify')?Response.json({success:true,hostname:'sscp.pages.dev',action:'incorrect-action'}):Response.json({id:'should-not-send'});
 result=await call('/api/enquiry','POST',valid);check(result.status===403,'turnstile action mismatch');
 globalThis.fetch=async(url,options)=>String(url).includes('siteverify')?Response.json({success:true,hostname:'sscp.pages.dev',action:'sscp_enquiry'}):new Response('failed',{status:422});
 result=await call('/api/enquiry','POST',valid);check(result.status===502,'email provider rejection surfaces failure');
}finally{globalThis.fetch=savedFetch;}
console.log(`PASS ${count} assertions: configuration, assets, secure origin, consent, validation, PDF attachments, Turnstile, email provider`);

// Deployment preflight guards: email config is not publicly ready without all secrets.
for (const key of ['RESEND_API_KEY', 'RESEND_FROM', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']) {
  const config = await call('/api/enquiry/config', 'GET', null, {}, {...env, [key]: ''});
  const body = await config.json();
  assert.equal(body.configured, false, `missing ${key} disables form`);
  assert.equal(body.siteKey, null, `missing ${key} does not leak site key`);
  const submit = await call('/api/enquiry', 'POST', valid, {}, {...env, [key]: ''});
  assert.equal(submit.status, 503, `missing ${key} blocks automatic sending`);
}
const fs = await import('node:fs');
const formHtml = fs.readFileSync(path.resolve(import.meta.dirname, '../contact.html'), 'utf8');
const js = fs.readFileSync(path.resolve(import.meta.dirname, '../script.js'), 'utf8');
assert.match(formHtml, /id="form-unavailable"/);
assert.match(formHtml, /href="mailto:sales@sscircuitproducts.com/);
assert.match(js, /form.hidden = true/);
assert.match(js, /config.configured !== true/);
console.log('PASS 12 additional readiness and fallback assertions');
