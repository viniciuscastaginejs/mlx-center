/* =========================================================
   MLX Mind · código compartilhado da área do cliente e admin
   ========================================================= */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Chave pública (publishable): pode ficar no site, quem protege os dados
// são as regras de acesso (RLS) configuradas no banco.
export const SUPABASE_URL = 'https://goxyheeaujeyvqcceqll.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_WnRjP4YldD6Fy1zuqZpeFQ_TsWqBsjK';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export const BUCKET = 'midias';

/* ---------- utilidades ---------- */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const dinheiro = v => brl.format(Number(v || 0));

// datas "AAAA-MM-DD" do banco, sempre no fuso local
export function parseData(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function isoData(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function hoje() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
export function addDias(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function inicioSemana(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const dia = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dia); return x; }
export function dataBR(s, opts = { day: '2-digit', month: '2-digit', year: 'numeric' }) { const d = typeof s === 'string' ? parseData(s) : s; return d ? d.toLocaleDateString('pt-BR', opts) : '—'; }
export function diaSemana(s) { return parseData(s).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', ''); }
export function diasAte(s) { return Math.round((parseData(s) - hoje()) / 86400000); }

export function iniciais(nome) { return (nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase(); }
export const ehVideo = p => /\.(mp4|mov|webm|m4v|ogg)$/i.test(p || '');

/* ---------- status ---------- */
export const STATUS_POST = {
  rascunho: ['Rascunho', 'b-dim'],
  aguardando_aprovacao: ['Aguardando aprovação', 'b-warn'],
  aprovado: ['Aprovado', 'b-ok'],
  ajuste_solicitado: ['Ajuste solicitado', 'b-bad'],
  agendado: ['Agendado', 'b-info'],
  publicado: ['Publicado', 'b-purple']
};
export const STATUS_IND = {
  nova: ['Nova', 'b-info'],
  em_conversa: ['Em conversa', 'b-warn'],
  fechou: ['Fechou', 'b-ok'],
  nao_fechou: ['Não fechou', 'b-dim']
};
export function statusPagamento(p) {
  if (p.status === 'pago') return ['Pago', 'b-ok'];
  if (p.status === 'cancelado') return ['Cancelado', 'b-dim'];
  const d = diasAte(p.vencimento);
  if (d < 0) return ['Atrasado', 'b-bad'];
  if (d <= 3) return [d === 0 ? 'Vence hoje' : `Vence em ${d} dia${d > 1 ? 's' : ''}`, 'b-warn'];
  return ['Em aberto', 'b-info'];
}
export const badge = ([txt, cls]) => `<span class="badge ${cls}">${esc(txt)}</span>`;

/* ---------- mídia (links temporários) ---------- */
const cacheUrl = new Map();
export async function urlsAssinadas(paths) {
  const faltando = [...new Set(paths.filter(p => p && !cacheUrl.has(p)))];
  if (faltando.length) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(faltando, 60 * 60 * 3);
    if (!error) data.forEach(d => { if (d.signedUrl) cacheUrl.set(d.path, d.signedUrl); });
  }
  return p => cacheUrl.get(p) || '';
}

// Galeria de uma postagem (setas + bolinhas quando há mais de uma mídia)
export function galeria(midias, url, extra = '') {
  if (!midias?.length) return `<div class="media">${extra}<div class="empty">Mídia ainda não enviada</div></div>`;
  const itens = midias.map((p, i) => {
    const u = esc(url(p));
    const el = ehVideo(p)
      ? `<video src="${u}" controls playsinline preload="metadata"></video>`
      : `<img src="${u}" alt="" loading="lazy">`;
    return `<div class="slide" data-i="${i}"${i ? ' hidden' : ''}>${el}</div>`;
  }).join('');
  const nav = midias.length > 1
    ? `<button class="nav prev" type="button" aria-label="Anterior">‹</button><button class="nav next" type="button" aria-label="Próxima">›</button><div class="dots">${midias.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>`
    : '';
  return `<div class="media" data-gal>${extra}${itens}${nav}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-gal] .nav');
  if (!b) return;
  const g = b.closest('[data-gal]'), slides = $$('.slide', g), dots = $$('.dots i', g);
  let i = slides.findIndex(s => !s.hidden);
  slides[i].hidden = true; slides[i].querySelector('video')?.pause();
  i = (i + (b.classList.contains('next') ? 1 : -1) + slides.length) % slides.length;
  slides[i].hidden = false;
  dots.forEach((d, j) => d.classList.toggle('on', j === i));
});

/* ---------- avisos ---------- */
let tt;
export function toast(msg, erro = false) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.toggle('err', erro); el.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 3200);
}
export function erroAmigavel(e) {
  const m = e?.message || String(e || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Esse e-mail ainda não foi confirmado.';
  if (/banned|User is banned/i.test(m)) return 'Seu acesso está suspenso. Fale com a MLX.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  if (/exceeded the maximum allowed size|Payload too large|413/i.test(m)) return 'Arquivo grande demais para o plano atual do Supabase (limite de 50 MB por arquivo).';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
  return m || 'Algo deu errado. Tente de novo.';
}
export async function copiar(txt) {
  try { await navigator.clipboard.writeText(txt); toast('Copiado!'); }
  catch { prompt('Copie:', txt); }
}

/* ---------- login (mesmo fluxo para cliente e admin) ---------- */
export function montarLogin(root, { titulo, subtitulo, eyebrow }) {
  root.innerHTML = `
  <section class="login">
    <div class="login-card">
      <span class="eyebrow">${esc(eyebrow)}</span>
      <h1>${esc(titulo)}</h1>
      <p>${esc(subtitulo)}</p>
      <form id="f-login" novalidate>
        <div class="field"><label for="l-email">E-mail</label><input id="l-email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="l-senha">Senha</label><input id="l-senha" type="password" autocomplete="current-password" required></div>
        <div id="l-msg" class="form-msg err" hidden></div>
        <button class="btn btn-primary" type="submit">Entrar</button>
      </form>
      <div class="login-foot">
        <button class="link" type="button" id="l-esqueci">Esqueci minha senha</button>
        <a href="/">← Voltar ao site</a>
      </div>
    </div>
  </section>`;
  const msg = $('#l-msg', root);
  const mostrar = (t, ok = false) => { msg.textContent = t; msg.className = 'form-msg ' + (ok ? 'ok' : 'err'); msg.hidden = false; };
  $('#f-login', root).addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter || $('button[type=submit]', root);
    const email = $('#l-email', root).value.trim(), password = $('#l-senha', root).value;
    if (!email || !password) return mostrar('Preencha e-mail e senha.');
    btn.disabled = true; btn.textContent = 'Entrando…'; msg.hidden = true;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = 'Entrar';
    if (error) mostrar(erroAmigavel(error));
  });
  $('#l-esqueci', root).addEventListener('click', async () => {
    const email = $('#l-email', root).value.trim();
    if (!email) return mostrar('Digite seu e-mail acima e clique de novo em "Esqueci minha senha".');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) return mostrar(erroAmigavel(error));
    mostrar('Se esse e-mail tiver acesso, enviamos um link para criar uma nova senha.', true);
  });
}

// Tela para criar nova senha (quando a pessoa chega pelo link do e-mail)
export function montarNovaSenha(root, aoConcluir) {
  root.innerHTML = `
  <section class="login"><div class="login-card">
    <span class="eyebrow">Nova senha</span>
    <h1>Crie sua nova senha</h1>
    <p>Use pelo menos 8 caracteres.</p>
    <form id="f-nova" novalidate>
      <div class="field"><label for="n-senha">Nova senha</label><input id="n-senha" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label for="n-senha2">Repita a senha</label><input id="n-senha2" type="password" autocomplete="new-password" minlength="8" required></div>
      <div id="n-msg" class="form-msg err" hidden></div>
      <button class="btn btn-primary" type="submit">Salvar senha</button>
    </form>
  </div></section>`;
  $('#f-nova', root).addEventListener('submit', async e => {
    e.preventDefault();
    const a = $('#n-senha', root).value, b = $('#n-senha2', root).value, msg = $('#n-msg', root);
    if (a.length < 8) { msg.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; msg.hidden = false; return; }
    if (a !== b) { msg.textContent = 'As senhas não são iguais.'; msg.hidden = false; return; }
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) { msg.textContent = erroAmigavel(error); msg.hidden = false; return; }
    toast('Senha atualizada!');
    history.replaceState(null, '', location.pathname);
    aoConcluir();
  });
}

export const LOGO = `<svg viewBox="0 0 600 500" aria-hidden="true"><defs><linearGradient id="lgp" x1="0" y1="0" x2="1" y2=".7"><stop offset="0" stop-color="#f08cff"/><stop offset=".45" stop-color="#b13cff"/><stop offset="1" stop-color="#5b12f2"/></linearGradient></defs><g fill="url(#lgp)"><path d="M190 8h402L473 142H68z"/><path d="M167 186h421L470 319H40z"/><path d="M137 357h414L425 493H8z"/></g></svg>`;

export const ICON = {
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 18 6-6-6-6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2A9.8 9.8 0 0 0 3.6 17l-1.3 4.8 4.9-1.3A9.8 9.8 0 1 0 12 2.2Zm0 17.9a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8.1 8.1 0 1 1 12 20.1Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>'
};
