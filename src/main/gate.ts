import { randomBytes, pbkdf2Sync, createCipheriv } from 'crypto'

const ITERATIONS = 200_000

/**
 * Encrypt an HTML document with a password and wrap it in a self-contained
 * page that prompts for the password and decrypts client-side (PBKDF2 +
 * AES-256-GCM via WebCrypto). This gives password protection on any static
 * host, with no server support required.
 *
 * The Node-side encryption here is the exact inverse of the WebCrypto code in
 * the generated page: same PBKDF2 (SHA-256, 200k iters) and AES-GCM with the
 * 16-byte auth tag appended to the ciphertext.
 */
export function encryptHtml(html: string, password: string, title: string): string {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(html, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  const payload = {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    // WebCrypto expects ciphertext || tag.
    data: Buffer.concat([ct, tag]).toString('base64'),
    iter: ITERATIONS
  }

  return PAGE(JSON.stringify(payload), escapeHtml(title))
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

const PAGE = (payloadJson: string, title: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
    background:#0f1115; color:#e6e9ef;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
  .card { width:320px; max-width:90vw; background:#151821; border:1px solid #262b37;
    border-radius:14px; padding:28px; text-align:center; }
  h1 { font-size:18px; margin:0 0 4px; }
  p { color:#8b93a5; font-size:13px; margin:0 0 18px; }
  input { width:100%; box-sizing:border-box; padding:11px 12px; border-radius:9px;
    border:1px solid #262b37; background:#0f1115; color:#e6e9ef; font-size:15px; }
  input:focus { outline:none; border-color:#7aa2f7; }
  button { width:100%; margin-top:10px; padding:11px; border:none; border-radius:9px;
    background:#7aa2f7; color:#0b0d12; font-weight:600; font-size:14px; cursor:pointer; }
  .err { color:#f7768e; font-size:12px; min-height:16px; margin-top:10px; }
</style>
</head>
<body>
  <form class="card" id="f">
    <h1>${title}</h1>
    <p>This presentation is password protected.</p>
    <input id="pw" type="password" autofocus autocomplete="current-password" placeholder="Password" />
    <button type="submit" id="go">View presentation</button>
    <div class="err" id="err"></div>
  </form>
<script>
const PAYLOAD = ${payloadJson};
function b64(s){const b=atob(s);const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
async function decrypt(password){
  const enc=new TextEncoder();
  const km=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey(
    {name:'PBKDF2',salt:b64(PAYLOAD.salt),iterations:PAYLOAD.iter,hash:'SHA-256'},
    km,{name:'AES-GCM',length:256},false,['decrypt']);
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(PAYLOAD.iv)},key,b64(PAYLOAD.data));
  return new TextDecoder().decode(pt);
}
const f=document.getElementById('f'), err=document.getElementById('err'), go=document.getElementById('go');
f.addEventListener('submit',async(e)=>{
  e.preventDefault(); err.textContent=''; go.disabled=true; go.textContent='Unlocking…';
  try{
    const html=await decrypt(document.getElementById('pw').value);
    document.open(); document.write(html); document.close();
  }catch(_){
    err.textContent='Incorrect password.'; go.disabled=false; go.textContent='View presentation';
  }
});
</script>
</body>
</html>`
