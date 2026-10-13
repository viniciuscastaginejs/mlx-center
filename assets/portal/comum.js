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

/* =========================================================
   v2 · utilidades extras (meses, números, gráficos, uploads)
   ========================================================= */
export const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export function mesISO(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
export function addMeses(iso, n) { const d = parseData(iso); return mesISO(new Date(d.getFullYear(), d.getMonth() + n, 1)); }
export function mesNome(iso) { const d = parseData(iso); return `${MESES[d.getMonth()]} de ${d.getFullYear()}`; }
export function mesCurto(iso) { const d = parseData(iso); return `${MESES[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`; }
export const cap = s => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

const nf = new Intl.NumberFormat('pt-BR');
export const num = v => (v === null || v === undefined || v === '') ? '—' : nf.format(Number(v));
export function compacto(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return nf.format(n);
}
export function bytes(n) {
  n = Number(n || 0);
  if (n < 1024) return n + ' B';
  if (n < 1024 ** 2) return (n / 1024).toFixed(0) + ' KB';
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1).replace('.', ',') + ' MB';
  return (n / 1024 ** 3).toFixed(2).replace('.', ',') + ' GB';
}
// variação entre dois valores → { txt: '+12%', cls: 'up'|'down'|'' }
export function variacao(atual, anterior, invertido = false) {
  if (atual === null || atual === undefined || anterior === null || anterior === undefined || Number(anterior) === 0) return null;
  const d = Number(atual) - Number(anterior), pct = d / Math.abs(Number(anterior)) * 100;
  const bom = invertido === true ? d < 0 : d > 0;
  return { dif: d, pct, txt: `${d > 0 ? '+' : ''}${pct.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0 })}%`, cls: d === 0 || invertido === 'neutro' ? '' : bom ? 'up' : 'down' };
}

// Definição das métricas mensais
export const METRICAS = [
  { k: 'seguidores', t: 'Seguidores', d: 'Total no fim do mês' },
  { k: 'alcance', t: 'Alcance', d: 'Contas alcançadas' },
  { k: 'visualizacoes', t: 'Visualizações', d: 'Impressões / views' },
  { k: 'interacoes', t: 'Interações', d: 'Curtidas, comentários, salvos, compartilhamentos' },
  { k: 'visitas_perfil', t: 'Visitas ao perfil', d: '' },
  { k: 'cliques', t: 'Cliques no link', d: 'Site, WhatsApp, link da bio' },
  { k: 'mensagens', t: 'Mensagens / conversas', d: 'Directs e conversas iniciadas' },
  { k: 'leads', t: 'Leads', d: 'Contatos interessados' },
  { k: 'investimento', t: 'Investimento em anúncios', d: 'R$', dinheiro: true }
];
export const REDES = ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'LinkedIn', 'Google Meu Negócio', 'Anúncios Meta', 'Anúncios Google', 'Site'];
export const STATUS_SOL = { aberta: ['Aberta', 'b-info'], em_andamento: ['Em andamento', 'b-warn'], concluida: ['Concluída', 'b-ok'], cancelada: ['Cancelada', 'b-dim'] };
export const STATUS_LEAD = { novo: ['Novo', 'b-info'], em_atendimento: ['Em atendimento', 'b-warn'], proposta: ['Proposta enviada', 'b-purple'], fechou: ['Fechou', 'b-ok'], perdido: ['Perdido', 'b-dim'] };
export const STATUS_MAT = { novo: ['Novo', 'b-info'], usado: ['Já usado', 'b-ok'], arquivado: ['Arquivado', 'b-dim'] };

/* ---------- links temporários de qualquer bucket ---------- */
const cacheB = new Map();
export async function urlsDe(bucket, paths, download = false) {
  const falta = [...new Set(paths.filter(p => p && !cacheB.has(bucket + (download ? '!' : '') + p)))];
  if (falta.length) {
    const { data } = await sb.storage.from(bucket).createSignedUrls(falta, 60 * 60 * 3, download ? { download: true } : undefined);
    (data || []).forEach(d => { if (d.signedUrl) cacheB.set(bucket + (download ? '!' : '') + d.path, d.signedUrl); });
  }
  return p => cacheB.get(bucket + (download ? '!' : '') + p) || '';
}
export async function baixar(bucket, path) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 120, { download: true });
  if (error) return toast(erroAmigavel(error), true);
  location.href = data.signedUrl;
}

/* ---------- compressão de imagem antes de enviar (pesa menos) ---------- */
export async function comprimirImagem(file, max = 2400, qualidade = 0.85) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.2 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const esc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', qualidade));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}
export function nomeSeguro(nome) {
  return (nome || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').slice(-80);
}
export const LIMITE_ARQUIVO = 50 * 1024 * 1024;

/* ---------- gráficos SVG simples ---------- */
export function grafico(pontos, { tipo = 'linha', altura = 180, cor = '#b65eff', fmt = compacto, claro = false } = {}) {
  const vals = pontos.map(p => p.v);
  const validos = vals.filter(v => v !== null && v !== undefined);
  if (validos.length < 1) return '<div class="graf-vazio">Sem dados suficientes ainda.</div>';
  const W = 600, H = altura, pl = 8, pr = 8, pt = 26, pb = 26;
  let mn = Math.min(...validos), mx = Math.max(...validos);
  if (tipo === 'barras') mn = 0;
  if (mx === mn) { mx = mx + 1; mn = Math.max(0, mn - 1); }
  const pad = (mx - mn) * 0.12; if (tipo !== 'barras') mn = Math.max(0, mn - pad); mx += pad;
  const n = pontos.length, larg = (W - pl - pr) / n;
  const x = i => pl + larg * i + larg / 2, y = v => pt + (H - pt - pb) * (1 - (v - mn) / (mx - mn));
  const txt = claro ? '#6b6178' : '#8f849b', grid = claro ? '#ece6f3' : '#ffffff12', val = claro ? '#2a1d3a' : '#efe4ff';
  let corpo = '';
  if (tipo === 'barras') {
    corpo = pontos.map((p, i) => p.v === null || p.v === undefined ? '' :
      `<rect x="${x(i) - larg * 0.28}" y="${y(p.v)}" width="${larg * 0.56}" height="${H - pb - y(p.v)}" rx="6" fill="${cor}" opacity="${i === n - 1 ? 1 : 0.55}"/>
       <text x="${x(i)}" y="${y(p.v) - 7}" text-anchor="middle" font-size="12" fill="${val}" font-weight="600">${esc(fmt(p.v))}</text>`).join('');
  } else {
    const seg = pontos.map((p, i) => p.v === null || p.v === undefined ? null : [x(i), y(p.v)]).filter(Boolean);
    const d = seg.map((s, i) => (i ? 'L' : 'M') + s[0].toFixed(1) + ' ' + s[1].toFixed(1)).join(' ');
    const area = seg.length > 1 ? `<path d="${d} L${seg.at(-1)[0]} ${H - pb} L${seg[0][0]} ${H - pb} Z" fill="${cor}" opacity=".12"/>` : '';
    corpo = area + `<path d="${d}" fill="none" stroke="${cor}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` +
      pontos.map((p, i) => p.v === null || p.v === undefined ? '' :
        `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === n - 1 ? 5 : 3.5}" fill="${cor}"/>
         <text x="${x(i)}" y="${y(p.v) - 10}" text-anchor="middle" font-size="12" fill="${val}" font-weight="600">${esc(fmt(p.v))}</text>`).join('');
  }
  const eixos = pontos.map((p, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="12" fill="${txt}">${esc(p.r)}</text>`).join('');
  return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="none" style="width:100%;height:auto">
    <line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" stroke="${grid}"/>${corpo}${eixos}</svg>`;
}

/* ---------- formulário em modal ---------- */
export function abrirModal(dlg, html, aoMontar) {
  dlg.innerHTML = `<button class="x" aria-label="Fechar" data-fechar>×</button>${html}`;
  if (!dlg.open) dlg.showModal();
  $$('[data-fechar]', dlg).forEach(b => b.onclick = () => dlg.close());
  aoMontar?.(dlg);
}

export const ICON2 = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  funnel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 4h18l-7 9v6l-4 2v-8z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 2h9l5 5v15H6z"/><path d="M9 17v-3M12 17v-6M15 17v-4"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8 11h8M8 14h5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 10v5M18 10v5"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.6-3.6 4.5-5.5 8-5.5s6.4 1.9 8 5.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1.2-3 3.6-4.5 6.5-4.5s5.3 1.5 6.5 4.5M16 4.5a3.5 3.5 0 0 1 0 7M18 15.5c1.7.6 2.8 2 3.5 4.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>'
};
