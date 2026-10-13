/* =========================================================
   MLX Mind · Painel admin (v2)
   ========================================================= */
import {
  sb, BUCKET, $, $$, esc, dinheiro, parseData, isoData, hoje, dataBR, diaSemana, iniciais, ehVideo,
  STATUS_POST, STATUS_IND, statusPagamento, badge, urlsAssinadas, toast, erroAmigavel, copiar,
  montarLogin, montarNovaSenha, LOGO, ICON, ICON2, mesISO, addMeses, mesNome, cap, bytes,
  METRICAS, REDES, STATUS_SOL, STATUS_LEAD, STATUS_MAT, urlsDe, baixar, comprimirImagem, nomeSeguro,
  LIMITE_ARQUIVO, abrirModal
} from './comum.js';
import { calendarioMes, vistaResultados, blocoMeta, blocoAcessos, listaAtividades, resumoLeads, linhaLead } from './blocos.js';

const app = $('#app'), topUser = $('#top-user'), dlg = $('#dlg');
$('#logo').outerHTML = LOGO;

const S = {
  uid: null, eu: null, contas: [], perfis: [], config: {}, alertas: {}, uso: [],
  vista: 'geral', sel: null, pessoa: null, aba: 'planejamento', busca: '', sideAberta: false,
  D: {}, url: () => '', urlMat: () => '', editando: null, mesRes: mesISO(), mesLeads: mesISO(), filtroMat: 'novo'
};
let recuperando = false;
const FORMATOS = ['Post', 'Carrossel', 'Reels', 'Stories', 'Vídeo', 'Outro'];
const UNIDADES = ['', 'leads', 'seguidores', 'vendas', 'R$', '%'];
const LIMITE_PLANO = 1024 ** 3; // 1 GB no plano grátis do Supabase
const mobile = () => innerWidth < 960;

/* ---------- sessão ---------- */
sb.auth.onAuthStateChange((evento, sessao) => {
  if (evento === 'PASSWORD_RECOVERY') {
    recuperando = true; topUser.hidden = true;
    montarNovaSenha(app, () => { recuperando = false; S.uid = null; setTimeout(iniciar); });
    return;
  }
  if (recuperando) return;
  const uid = sessao?.user?.id ?? null;
  if (evento === 'INITIAL_SESSION' || uid !== S.uid) { S.uid = uid; setTimeout(iniciar); }
});

async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    topUser.hidden = true;
    montarLogin(app, { eyebrow: 'Equipe MLX', titulo: 'Painel admin', subtitulo: 'Acesso exclusivo da equipe MLX Mind.' });
    return;
  }
  app.innerHTML = '<div class="loading"><div><div class="spin"></div>Carregando painel…</div></div>';
  const { data: eu, error } = await sb.from('perfis').select('*').eq('id', session.user.id).single();
  if (error || !eu || eu.papel !== 'admin' || !eu.ativo) {
    topUser.innerHTML = `<button class="btn btn-sm btn-ghost" id="sair">${ICON.out}Sair</button>`; topUser.hidden = false;
    $('#sair').onclick = () => sb.auth.signOut();
    app.innerHTML = `<section class="login"><div class="login-card"><span class="eyebrow">Acesso restrito</span><h1>Esse painel é só da equipe MLX</h1>
      <p>Seu login é de cliente. A sua área fica no link abaixo.</p><a class="btn btn-primary" href="/cliente/">Ir para a área do cliente</a></div></section>`;
    return;
  }
  S.eu = eu;
  topUser.innerHTML = `<span class="who">Olá, <b>${esc(eu.nome.split(' ')[0] || 'equipe')}</b></span>
    <button class="btn btn-sm btn-ghost" id="sair">${ICON.out}<span class="hide-sm">Sair</span></button>`;
  topUser.hidden = false;
  $('#sair').onclick = () => sb.auth.signOut();
  await recarregarBase();
  render();
}

async function recarregarBase() {
  const hojeIso = isoData(hoje());
  const r = await Promise.all([
    sb.from('contas').select('*').order('nome'),
    sb.from('perfis').select('*').order('nome'),
    sb.from('configuracoes').select('*').eq('id', 1).single(),
    sb.from('postagens').select('id,conta_id,titulo,data_publicacao,comentario_cliente,status,respondido_por_nome').in('status', ['ajuste_solicitado', 'aguardando_aprovacao']).order('data_publicacao'),
    sb.from('pagamentos').select('id,conta_id,descricao,valor,vencimento,status').eq('status', 'pendente').lt('vencimento', hojeIso).order('vencimento'),
    sb.from('indicacoes').select('id,conta_id,nome_indicado,contato,criado_em,status').eq('status', 'nova').order('criado_em', { ascending: false }),
    sb.from('solicitacoes').select('id,conta_id,titulo,tipo,prazo,status,criado_por_nome,criado_em').in('status', ['aberta', 'em_andamento']).order('criado_em'),
    sb.from('materiais').select('id,conta_id,nome_arquivo,enviado_por_nome,criado_em').eq('status', 'novo').order('criado_em', { ascending: false }),
    sb.rpc('uso_armazenamento')
  ]);
  const erro = r.find(x => x.error); if (erro) toast(erroAmigavel(erro.error), true);
  const [contas, perfis, config, posts, atrasados, novas, sols, mats, uso] = r.map(x => x.data || []);
  Object.assign(S, { contas, perfis, config: config || {}, uso });
  S.alertas = {
    ajustes: posts.filter(p => p.status === 'ajuste_solicitado'),
    aguardando: posts.filter(p => p.status === 'aguardando_aprovacao'),
    atrasados, novas, sols, mats
  };
}

const conta = () => S.contas.find(c => c.id === S.sel);
const nomeConta = id => S.contas.find(c => c.id === id)?.nome || '—';
const membros = id => S.perfis.filter(p => p.conta_id === id);
const usoConta = id => S.uso.filter(u => u.conta_id === id).reduce((s, u) => s + Number(u.bytes), 0);
const usoTotal = () => S.uso.reduce((s, u) => s + Number(u.bytes), 0);
const alertasConta = id => ['ajustes', 'atrasados', 'novas', 'sols', 'mats'].reduce((n, k) => n + S.alertas[k].filter(x => x.conta_id === id).length, 0);

async function chamarFuncao(body) {
  const { data, error } = await sb.functions.invoke('admin-usuarios', { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j?.erro) msg = j.erro; } catch {}
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

/* ---------- CPF / CNPJ e utilidades ---------- */
const soDigitos = v => String(v || '').replace(/\D/g, '');
function mascaraDoc(v, pj) {
  const d = soDigitos(v).slice(0, pj ? 14 : 11);
  if (pj) return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function cpfOk(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); if ((s * 10 % 11) % 10 !== +c[n]) return false; }
  return true;
}
function cnpjOk(c) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
  const calc = n => { let s = 0, pos = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * pos--; if (pos < 2) pos = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === +c[12] && calc(13) === +c[13];
}
function parseValor(txt) {
  let t = String(txt || '').trim().replace(/[^\d,.-]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return Number(t);
}
function gerarSenha() {
  const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return 'Mlx-' + [...crypto.getRandomValues(new Uint32Array(10))].map(n => c[n % c.length]).join('');
}
const msgErro = (sel, t) => { const m = $(sel); m.textContent = t; m.hidden = false; };

/* ---------- layout ---------- */
function render() {
  const fechada = mobile() && !S.sideAberta && S.vista !== 'geral';
  app.innerHTML = `
  <div class="admin">
    <aside class="side${fechada ? ' fechada' : ''}" aria-label="Clientes">
      <button class="btn btn-primary" id="novo-cli">${ICON.plus}Novo cliente</button>
      <input class="inp" id="busca" type="search" placeholder="Buscar cliente…" value="${esc(S.busca)}" aria-label="Buscar cliente">
      <div class="side-list" id="side-list"></div>
    </aside>
    <section class="main" id="main"></section>
  </div>`;
  $('#novo-cli').onclick = dialogoNovaConta;
  $('#busca').oninput = e => { S.busca = e.target.value; renderLista(); };
  renderLista();
  renderMain();
}

function renderLista() {
  const q = S.busca.toLowerCase().trim(), qd = soDigitos(q);
  const bate = c => !q || [c.nome, c.documento].some(v => (v || '').toLowerCase().includes(q)) || (qd && (c.documento || '').includes(qd))
    || membros(c.id).some(p => [p.nome, p.email].some(v => (v || '').toLowerCase().includes(q)));
  const contas = S.contas.filter(bate);
  const equipe = S.perfis.filter(p => p.papel === 'admin' && (!q || [p.nome, p.email].some(v => (v || '').toLowerCase().includes(q))));
  const total = ['ajustes', 'atrasados', 'novas', 'sols', 'mats'].reduce((n, k) => n + S.alertas[k].length, 0);
  $('#side-list').innerHTML = `
    <button class="side-item" data-vista="geral" aria-current="${S.vista === 'geral'}"><span class="av">${ICON2.home}</span><span class="t"><b>Visão geral</b><small>${total ? total + ' pendência' + (total > 1 ? 's' : '') : 'Tudo em ordem'}</small></span>${total ? `<span class="count">${total}</span>` : ''}</button>
    <button class="side-item" data-vista="config" aria-current="${S.vista === 'config'}"><span class="av">${ICON2.gear}</span><span class="t"><b>Configurações</b><small>Indicação, PIX, avisos</small></span></button>
    <div class="side-h">Clientes (${contas.length})</div>
    ${contas.map(c => {
      const n = alertasConta(c.id), m = membros(c.id);
      return `<button class="side-item${c.ativo ? '' : ' off'}" data-conta="${c.id}" aria-current="${S.vista === 'conta' && S.sel === c.id}">
        <span class="av">${esc(iniciais(c.nome))}</span>
        <span class="t"><b>${esc(c.nome)}</b><small>${c.tipo_pessoa === 'pj' ? 'Empresa' : 'Pessoa física'} · ${m.length} login${m.length === 1 ? '' : 's'}${c.ativo ? '' : ' · suspenso'}</small></span>
        ${n ? `<span class="count">${n}</span>` : ''}</button>`;
    }).join('') || '<p class="side-vazio">Nenhum cliente ainda.</p>'}
    <div class="side-h">Equipe MLX</div>
    ${equipe.map(p => `<button class="side-item${p.ativo ? '' : ' off'}" data-pessoa="${p.id}" aria-current="${S.vista === 'pessoa' && S.pessoa === p.id}">
      <span class="av">${esc(iniciais(p.nome))}</span><span class="t"><b>${esc(p.nome || p.email)}${p.id === S.eu.id ? ' (você)' : ''}</b><small>${esc(p.email || '')}</small></span></button>`).join('')}
    <button class="side-item" data-equipe><span class="av">+</span><span class="t"><b>Adicionar alguém da equipe</b></span></button>`;
  const lista = $('#side-list');
  $$('[data-conta]', lista).forEach(b => b.onclick = () => abrirConta(b.dataset.conta));
  $$('[data-vista]', lista).forEach(b => b.onclick = () => { S.vista = b.dataset.vista; S.sel = null; S.sideAberta = false; render(); if (mobile()) scrollTo({ top: 0 }); });
  $$('[data-pessoa]', lista).forEach(b => b.onclick = () => { S.vista = 'pessoa'; S.pessoa = b.dataset.pessoa; S.sideAberta = false; render(); if (mobile()) scrollTo({ top: 0 }); });
  $('[data-equipe]', lista).onclick = dialogoNovaEquipe;
}

const barraMobile = () => mobile() ? `<button class="voltar" id="voltar">${ICON.prev}<span>Clientes e menu</span></button>` : '';
function ligarVoltar() {
  $('#voltar')?.addEventListener('click', () => { S.sideAberta = true; render(); scrollTo({ top: 0, behavior: 'smooth' }); });
}

function renderMain() {
  if (S.vista === 'config') return vistaConfig();
  if (S.vista === 'pessoa') return vistaPessoaEquipe();
  if (S.vista === 'conta' && conta()) return vistaConta();
  return vistaGeral();
}

async function abrirConta(id, aba) {
  S.vista = 'conta'; S.sel = id; S.editando = null; S.sideAberta = false;
  if (aba) S.aba = aba;
  render();
  $('#main').innerHTML = '<div class="loading"><div><div class="spin"></div>Carregando…</div></div>';
  if (mobile()) scrollTo({ top: 0 });
  await carregarConta();
  vistaConta();
}

async function carregarConta() {
  const id = S.sel;
  const q = (t, o = 'criado_em', asc = false) => sb.from(t).select('*').eq('conta_id', id).order(o, { ascending: asc });
  const r = await Promise.all([
    q('postagens', 'data_publicacao'), q('pagamentos', 'vencimento'), q('indicacoes'), q('metricas', 'mes'), q('metas', 'mes'),
    q('relatorios', 'mes'), q('leads', 'data'), q('materiais'), q('solicitacoes'), q('documentos'), q('acessos', 'rede', true),
    sb.from('atividades').select('*').eq('conta_id', id).order('criado_em', { ascending: false }).limit(200)
  ]);
  const erro = r.find(x => x.error); if (erro) toast(erroAmigavel(erro.error), true);
  const [posts, pags, inds, metricas, metas, rels, leads, mats, sols, docs, acs, ativ] = r.map(x => x.data || []);
  S.D = { _conta: id, posts, pags, inds, metricas, metas, rels, leads, mats, sols, docs, acs, ativ };
  S.url = await urlsAssinadas(posts.flatMap(p => p.midias || []));
  S.urlMat = await urlsDe('materiais', mats.filter(m => (m.tipo_mime || '').startsWith('image/')).map(m => m.path));
}
async function atualizar(msg) {
  if (msg) toast(msg);
  await Promise.all([carregarConta(), recarregarBase()]);
  renderLista(); vistaConta();
}

/* ---------- Visão geral ---------- */
function vistaGeral() {
  const A = S.alertas, uso = usoTotal(), pct = Math.min(100, Math.round(uso / LIMITE_PLANO * 100));
  const bloco = (titulo, itens, fn, vazio) => `<div class="panel"><h3>${titulo} <span class="count">${itens.length}</span></h3>
    ${itens.length ? itens.slice(0, 10).map(fn).join('') : `<p class="vazio-txt">${vazio}</p>`}</div>`;
  $('#main').innerHTML = `
    <div class="main-head"><div><h1>Visão geral</h1><p>${S.contas.length} cliente${S.contas.length === 1 ? '' : 's'} · ${A.aguardando.length} postage${A.aguardando.length === 1 ? 'm' : 'ns'} esperando aprovação dos clientes</p></div></div>
    ${S.contas.length ? '' : `<div class="empty-state" style="margin-bottom:18px"><b>Comece cadastrando o primeiro cliente</b>Toque em "Novo cliente". Ele recebe e-mail e senha para entrar em mlxmind.com.br/cliente.</div>`}
    <div class="pend">
      ${bloco('Ajustes pedidos', A.ajustes, p => `<button class="pend-item" data-abrir="${p.conta_id}" data-aba="planejamento"><b>${esc(p.titulo)}</b><small>${esc(nomeConta(p.conta_id))} · ${dataBR(p.data_publicacao)}${p.respondido_por_nome ? ' · ' + esc(p.respondido_por_nome) : ''}</small>${p.comentario_cliente ? `<small class="cita">“${esc(p.comentario_cliente)}”</small>` : ''}</button>`, 'Nenhum ajuste pendente.')}
      ${bloco('Solicitações abertas', A.sols, s => `<button class="pend-item" data-abrir="${s.conta_id}" data-aba="solicitacoes"><b>${esc(s.titulo)}</b><small>${esc(nomeConta(s.conta_id))} · ${esc(s.tipo)}${s.prazo ? ' · até ' + dataBR(s.prazo, { day: '2-digit', month: '2-digit' }) : ''} · ${STATUS_SOL[s.status][0]}</small></button>`, 'Nenhuma solicitação aberta.')}
      ${bloco('Materiais novos', A.mats, m => `<button class="pend-item" data-abrir="${m.conta_id}" data-aba="materiais"><b>${esc(m.nome_arquivo)}</b><small>${esc(nomeConta(m.conta_id))} · ${esc(m.enviado_por_nome || '')} · ${dataBR(m.criado_em.slice(0, 10), { day: '2-digit', month: '2-digit' })}</small></button>`, 'Nenhum material novo.')}
      ${bloco('Pagamentos atrasados', A.atrasados, p => `<button class="pend-item" data-abrir="${p.conta_id}" data-aba="pagamentos"><b>${esc(nomeConta(p.conta_id))} · ${dinheiro(p.valor)}</b><small>${esc(p.descricao)} · venceu ${dataBR(p.vencimento)}</small></button>`, 'Nenhum pagamento atrasado.')}
      ${bloco('Indicações novas', A.novas, i => `<button class="pend-item" data-abrir="${i.conta_id}" data-aba="indicacoes"><b>${esc(i.nome_indicado)}</b><small>Indicado por ${esc(nomeConta(i.conta_id))}${i.contato ? ' · ' + esc(i.contato) : ''}</small></button>`, 'Nenhuma indicação nova.')}
      <div class="panel"><h3>Armazenamento</h3>
        <div class="meta${pct > 85 ? '' : ' ok'}" style="border:0;padding:0;background:none"><div class="meta-top"><b>${bytes(uso)} de 1 GB</b><span>${pct}%</span></div><div class="barra"><i style="width:${pct}%"></i></div>
        <small>Fotos, vídeos, materiais e documentos de todos os clientes. ${pct > 70 ? '<b style="color:var(--warn)">Está enchendo: apague materiais já usados ou considere o plano Pro do Supabase (100 GB).</b>' : 'O plano grátis do Supabase tem 1 GB.'}</small></div>
      </div>
    </div>`;
  $$('[data-abrir]', $('#main')).forEach(b => b.onclick = () => abrirConta(b.dataset.abrir, b.dataset.aba));
}

/* ---------- Configurações ---------- */
function vistaConfig() {
  const c = S.config;
  $('#main').innerHTML = `${barraMobile()}
    <div class="main-head"><div><h1>Configurações</h1><p>Valem para todos os clientes.</p></div></div>
    <form class="panel" id="f-config">
      <h3>Programa de indicação</h3>
      <div class="field"><label for="c-desc">Desconto oferecido (aparece em destaque para o cliente)</label><textarea id="c-desc" maxlength="300">${esc(c.desconto_indicacao)}</textarea></div>
      <div class="field"><label for="c-regras">Regras / como funciona</label><textarea id="c-regras" maxlength="800">${esc(c.regras_indicacao)}</textarea></div>
      <h3 class="form-sub">Pagamentos e contato</h3>
      <div class="grid-2">
        <div class="field"><label for="c-pix">Chave PIX da MLX</label><input id="c-pix" maxlength="140" value="${esc(c.chave_pix || '')}" placeholder="CNPJ, e-mail, telefone ou chave aleatória"></div>
        <div class="field"><label for="c-wa">WhatsApp da MLX</label><input id="c-wa" maxlength="16" inputmode="numeric" value="${esc(c.whatsapp || '')}" placeholder="5516991234567"><small>Só números, com 55 + DDD.</small></div>
      </div>
      <h3 class="form-sub">Avisos por e-mail</h3>
      <label class="check" style="margin-bottom:14px"><input type="checkbox" id="c-av"${c.avisos_ativos ? ' checked' : ''}> Enviar avisos automáticos (posts para aprovar, relatórios, documentos, lembretes de pagamento)</label>
      <div class="grid-2">
        <div class="field"><label for="c-eq">E-mails da equipe que recebem os avisos</label><input id="c-eq" maxlength="300" value="${esc(c.email_equipe || '')}" placeholder="vinicius@mlxmind.com.br, gustavo@mlxmind.com.br"><small>Separados por vírgula. Recebem: ajustes pedidos, solicitações, materiais e indicações.</small></div>
        <div class="field"><label for="c-rem">Remetente</label><input id="c-rem" maxlength="120" value="${esc(c.email_remetente || '')}"><small>Precisa ser de um domínio verificado no Resend.</small></div>
      </div>
      <div class="aviso-seg" style="margin:6px 0 16px">${ICON2.lock}<div>Os e-mails saem pelo <b>Resend</b> (grátis até 3.000/mês). Enquanto a chave não estiver configurada no Supabase, os avisos ficam guardados na fila e saem assim que ela for ativada.</div></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar configurações</button></div>
    </form>`;
  ligarVoltar();
  $('#f-config').onsubmit = async e => {
    e.preventDefault();
    const wa = soDigitos($('#c-wa').value);
    if (wa && !/^\d{12,13}$/.test(wa)) return toast('WhatsApp inválido. Use 55 + DDD + número.', true);
    const upd = { desconto_indicacao: $('#c-desc').value.trim(), regras_indicacao: $('#c-regras').value.trim(), chave_pix: $('#c-pix').value.trim() || null,
      whatsapp: wa || null, avisos_ativos: $('#c-av').checked, email_equipe: $('#c-eq').value.trim() || null,
      email_remetente: $('#c-rem').value.trim() || 'MLX Mind <avisos@mlxmind.com.br>', atualizado_em: new Date().toISOString() };
    const { error } = await sb.from('configuracoes').update(upd).eq('id', 1);
    if (error) return toast(erroAmigavel(error), true);
    Object.assign(S.config, upd); toast('Configurações salvas.');
  };
}

/* ---------- Conta ---------- */
const ABAS = [
  ['planejamento', 'Planejamento'], ['resultados', 'Resultados'], ['leads', 'Leads'], ['relatorios', 'Relatórios'],
  ['solicitacoes', 'Solicitações'], ['materiais', 'Materiais'], ['pagamentos', 'Pagamentos'], ['documentos', 'Documentos'],
  ['acessos', 'Acessos'], ['indicacoes', 'Indicações'], ['pessoas', 'Pessoas'], ['dados', 'Dados'], ['historico', 'Histórico']
];
function vistaConta() {
  const c = conta(), D = S.D;
  if (D._conta !== S.sel) { $('#main').innerHTML = '<div class="loading"><div><div class="spin"></div>Carregando…</div></div>'; return; }
  const abas = ABAS.filter(([k]) => k !== 'leads' || c.modulo_leads);
  if (!abas.some(([k]) => k === S.aba)) S.aba = 'planejamento';
  const cont = {
    planejamento: D.posts.filter(p => p.status === 'ajuste_solicitado').length, solicitacoes: D.sols.filter(s => s.status === 'aberta').length,
    materiais: D.mats.filter(m => m.status === 'novo').length, pagamentos: D.pags.filter(p => statusPagamento(p)[1] === 'b-bad').length,
    indicacoes: D.inds.filter(i => i.status === 'nova').length
  };
  const pessoas = membros(c.id);
  $('#main').innerHTML = `${barraMobile()}
    <div class="main-head">
      <div><h1>${esc(c.nome)} <span class="chip chip-inline">${c.tipo_pessoa === 'pj' ? 'Empresa' : 'Pessoa física'}</span></h1>
        <p>${esc([c.documento ? (c.tipo_pessoa === 'pj' ? 'CNPJ ' : 'CPF ') + mascaraDoc(c.documento, c.tipo_pessoa === 'pj') : null, c.telefone, pessoas.length ? pessoas.map(p => p.nome.split(' ')[0]).join(', ') : 'sem logins'].filter(Boolean).join(' · '))}${c.ativo ? '' : ' · <span style="color:var(--bad)">acesso suspenso</span>'}</p></div>
      <div class="code-box mini"><span>Código</span><code>${esc(c.codigo_indicacao)}</code></div>
    </div>
    <div class="tabs" role="tablist">
      ${abas.map(([k, t]) => `<button class="tab" role="tab" data-aba="${k}" aria-selected="${S.aba === k}">${t}${cont[k] ? ` <span class="count">${cont[k]}</span>` : ''}</button>`).join('')}
    </div>
    <div id="aba"></div>`;
  ligarVoltar();
  $$('.tab', $('#main')).forEach(t => t.onclick = () => { S.aba = t.dataset.aba; S.editando = null; vistaConta(); });
  const ativa = $('.tab[aria-selected="true"]');
  if (ativa) ativa.parentElement.scrollLeft = ativa.offsetLeft - ativa.parentElement.clientWidth / 2 + ativa.clientWidth / 2;
  ({ planejamento: abaPlanejamento, resultados: abaResultados, leads: abaLeads, relatorios: abaRelatorios, solicitacoes: abaSolicitacoes,
     materiais: abaMateriais, pagamentos: abaPagamentos, documentos: abaDocumentos, acessos: abaAcessos, indicacoes: abaIndicacoes,
     pessoas: abaPessoas, dados: abaDados, historico: abaHistorico })[S.aba]();
}

/* ----- Planejamento ----- */
function abaPlanejamento() {
  const el = $('#aba'), D = S.D, ed = S.editando ? D.posts.find(p => p.id === S.editando) : null, c = conta();
  const redes = [...new Set([...c.redes, 'Instagram', 'Facebook', 'TikTok', 'YouTube', 'LinkedIn', 'Outro'])];
  const opt = (lista, v) => lista.map(x => `<option${x === v ? ' selected' : ''}>${x}</option>`).join('');
  const mantidas = ed ? [...(ed.midias || [])] : [];
  const hojeIso = isoData(hoje());
  const futuras = D.posts.filter(p => p.data_publicacao >= hojeIso).reverse(), passadas = D.posts.filter(p => p.data_publicacao < hojeIso);

  el.innerHTML = `
    <form class="panel" id="f-post">
      <div class="panel-h"><h3>${ed ? 'Editar postagem' : 'Nova postagem'}</h3>${ed ? '<button class="btn btn-sm btn-ghost" type="button" id="cancelar-ed">Cancelar edição</button>' : ''}</div>
      <div class="grid-2">
        <div class="field full"><label for="p-tit">Título</label><input id="p-tit" maxlength="140" value="${esc(ed?.titulo || '')}" placeholder="Ex.: Promoção de terça"></div>
        <div class="field"><label for="p-data">Data</label><input id="p-data" type="date" value="${esc(ed?.data_publicacao || hojeIso)}"></div>
        <div class="field"><label for="p-hora">Horário (opcional)</label><input id="p-hora" type="time" value="${esc(ed?.horario?.slice(0, 5) || '')}"></div>
        <div class="field"><label for="p-fmt">Formato</label><select id="p-fmt">${opt(FORMATOS, ed?.formato || 'Post')}</select></div>
        <div class="field"><label for="p-rede">Rede</label><select id="p-rede">${opt(redes, ed?.rede || c.redes[0] || 'Instagram')}</select></div>
        <div class="field full"><label for="p-status">Status</label><select id="p-status">${Object.entries(STATUS_POST).map(([k, [t]]) => `<option value="${k}"${k === (ed?.status || 'aguardando_aprovacao') ? ' selected' : ''}>${t}${k === 'rascunho' ? ' (cliente não vê)' : ''}</option>`).join('')}</select></div>
        <div class="field full"><label for="p-leg">Legenda</label><textarea id="p-leg" maxlength="5000">${esc(ed?.legenda || '')}</textarea></div>
        <div class="field full"><span class="lbl">Fotos e vídeos</span>
          <div class="thumbs" id="thumbs"></div>
          <label class="dropzone compacta">${ICON2.upload}<b>Escolher arquivos</b><small>Vários arquivos viram carrossel. Fotos são otimizadas; vídeos até 50 MB.</small><input id="p-arq" type="file" accept="image/*,video/*" multiple hidden></label></div>
      </div>
      <div class="progress" id="prog" hidden><i></i></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${ed ? 'Salvar alterações' : 'Adicionar ao planejamento'}</button></div>
    </form>
    <div class="panel-h"><h3 class="section-h" style="margin:0">Próximas (${futuras.length})</h3><button class="btn btn-sm" id="ver-cal">${ICON2.cal}Calendário</button></div>
    ${futuras.length ? `<div class="list">${futuras.map(linhaPost).join('')}</div>` : '<p class="vazio-txt">Nenhuma postagem futura.</p>'}
    ${passadas.length ? `<h3 class="section-h">Anteriores (${passadas.length})</h3><div class="list">${passadas.slice(0, 40).map(linhaPost).join('')}</div>` : ''}`;

  let novos = [];
  const desenhar = () => {
    $('#thumbs').innerHTML =
      mantidas.map((p, i) => `<div class="thumb">${ehVideo(p) ? `<video src="${esc(S.url(p))}" muted></video><span class="tag">vídeo</span>` : `<img src="${esc(S.url(p))}" alt="">`}<button type="button" data-rm-old="${i}" aria-label="Remover">×</button></div>`).join('') +
      novos.map((f, i) => `<div class="thumb">${f.type.startsWith('video') ? `<video src="${f._url}" muted></video><span class="tag">vídeo</span>` : `<img src="${f._url}" alt="">`}<button type="button" data-rm-new="${i}" aria-label="Remover">×</button></div>`).join('');
    $$('[data-rm-old]', el).forEach(b => b.onclick = () => { mantidas.splice(+b.dataset.rmOld, 1); desenhar(); });
    $$('[data-rm-new]', el).forEach(b => b.onclick = () => { novos.splice(+b.dataset.rmNew, 1); desenhar(); });
  };
  $('#p-arq').onchange = e => { novos.push(...[...e.target.files].map(f => Object.assign(f, { _url: URL.createObjectURL(f) }))); e.target.value = ''; desenhar(); };
  desenhar();
  $('#cancelar-ed')?.addEventListener('click', () => { S.editando = null; abaPlanejamento(); });
  $('#ver-cal').onclick = () => calendarioModal();

  $('#f-post').onsubmit = async e => {
    e.preventDefault();
    const titulo = $('#p-tit').value.trim(), data = $('#p-data').value;
    if (!titulo || !data) return toast('Preencha título e data.', true);
    const grande = novos.find(f => f.size > LIMITE_ARQUIVO && !f.type.startsWith('image/'));
    if (grande) return toast(`"${grande.name}" passa de 50 MB. Comprima o vídeo antes.`, true);
    const btn = e.submitter; btn.disabled = true;
    const barra = $('#prog i'); $('#prog').hidden = !novos.length;
    try {
      const enviados = [];
      for (const [i, f0] of novos.entries()) {
        btn.textContent = `Enviando ${i + 1} de ${novos.length}…`;
        const f = await comprimirImagem(f0);
        const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${S.sel}/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type });
        if (error) throw error;
        enviados.push(path); barra.style.width = `${((i + 1) / novos.length) * 100}%`;
      }
      const reg = { conta_id: S.sel, titulo, data_publicacao: data, horario: $('#p-hora').value || null, status: $('#p-status').value,
        formato: $('#p-fmt').value, rede: $('#p-rede').value, legenda: $('#p-leg').value.trim() || null, midias: [...mantidas, ...enviados] };
      if (ed) {
        const { error } = await sb.from('postagens').update(reg).eq('id', ed.id); if (error) throw error;
        const removidas = (ed.midias || []).filter(p => !mantidas.includes(p));
        if (removidas.length) await sb.storage.from(BUCKET).remove(removidas);
      } else {
        const { error } = await sb.from('postagens').insert(reg); if (error) throw error;
      }
      S.editando = null; atualizar(ed ? 'Postagem atualizada.' : 'Postagem adicionada. O cliente foi avisado.');
    } catch (err) { toast(erroAmigavel(err), true); btn.disabled = false; btn.textContent = ed ? 'Salvar alterações' : 'Adicionar ao planejamento'; }
  };
  ligarLinhasPost(el);
}
function linhaPost(p) {
  const m = p.midias?.[0];
  const mini = m ? (ehVideo(m) ? `<video src="${esc(S.url(m))}" muted preload="metadata"></video>` : `<img src="${esc(S.url(m))}" alt="" loading="lazy">`) : 'sem mídia';
  return `<div class="arow">
    <div class="mini">${mini}</div>
    <div><h4>${esc(p.titulo)}</h4>
      <div class="sub">${esc(diaSemana(p.data_publicacao))}${p.horario ? ' ' + p.horario.slice(0, 5) : ''} · ${esc(p.formato)} · ${esc(p.rede)}${p.midias?.length > 1 ? ` · ${p.midias.length} arquivos` : ''}</div>
      ${p.respondido_por_nome && p.status === 'aprovado' ? `<div class="sub">Aprovado por ${esc(p.respondido_por_nome)}</div>` : ''}
      ${p.comentario_cliente && p.status === 'ajuste_solicitado' ? `<div class="note" style="margin-top:8px"><b>${esc(p.respondido_por_nome || 'Cliente')} pediu:</b> ${esc(p.comentario_cliente)}</div>` : ''}
    </div>
    <div class="acts">
      <select class="sel-sm" data-st-post="${p.id}" aria-label="Status">${Object.entries(STATUS_POST).map(([k, [t]]) => `<option value="${k}"${k === p.status ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <button class="btn btn-sm" data-ed-post="${p.id}">Editar</button>
      <button class="btn btn-sm btn-danger" data-del-post="${p.id}">Excluir</button>
    </div></div>`;
}
function ligarLinhasPost(el) {
  const D = S.D;
  $$('[data-st-post]', el).forEach(s => s.onchange = async () => {
    const { error } = await sb.from('postagens').update({ status: s.value }).eq('id', s.dataset.stPost);
    if (error) return toast(erroAmigavel(error), true);
    atualizar('Status atualizado.');
  });
  $$('[data-ed-post]', el).forEach(b => b.onclick = () => { S.editando = b.dataset.edPost; abaPlanejamento(); $('#f-post').scrollIntoView({ behavior: 'smooth' }); });
  $$('[data-del-post]', el).forEach(b => b.onclick = async () => {
    const p = D.posts.find(x => x.id === b.dataset.delPost);
    if (!confirm(`Excluir a postagem "${p.titulo}"? As fotos e vídeos dela também serão apagados.`)) return;
    const { error } = await sb.from('postagens').delete().eq('id', p.id);
    if (error) return toast(erroAmigavel(error), true);
    if (p.midias?.length) await sb.storage.from(BUCKET).remove(p.midias);
    atualizar('Postagem excluída.');
  });
}
function calendarioModal(mes = mesISO()) {
  const fim = addMeses(mes, 1), lista = S.D.posts.filter(p => p.data_publicacao >= mes && p.data_publicacao < fim);
  const editar = id => { dlg.close(); S.editando = id; abaPlanejamento(); $('#f-post').scrollIntoView({ behavior: 'smooth' }); };
  abrirModal(dlg, `<h2>${esc(cap(mesNome(mes)))}</h2><p class="dsub">${lista.length} postage${lista.length === 1 ? 'm' : 'ns'} · toque numa postagem para editar</p>
    <div class="form-actions" style="margin-bottom:12px"><button class="btn btn-sm" id="cm-ant">${ICON.prev}Anterior</button><button class="btn btn-sm" id="cm-prox">Próximo${ICON.next}</button></div>
    ${calendarioMes(lista, mes)}<div id="cm-dia"></div>`, d => {
    d.classList.add('largo'); d.addEventListener('close', () => d.classList.remove('largo'), { once: true });
    $('#cm-ant', d).onclick = () => calendarioModal(addMeses(mes, -1));
    $('#cm-prox', d).onclick = () => calendarioModal(addMeses(mes, 1));
    $$('[data-post]', d).forEach(b => b.onclick = e => { e.stopPropagation(); editar(b.dataset.post); });
    $$('[data-dia]', d).forEach(c => c.onclick = () => {
      const doDia = lista.filter(p => p.data_publicacao === c.dataset.dia);
      $$('.cal-d.sel', d).forEach(x => x.classList.remove('sel')); c.classList.add('sel');
      $('#cm-dia', d).innerHTML = doDia.length ? `<h4 class="mes-h">${esc(cap(diaSemana(c.dataset.dia)))}</h4><div class="list">${doDia.map(p => `<button class="row row-btn" data-ed="${p.id}"><div><h4>${esc(p.titulo)}</h4><div class="sub">${esc(p.formato)} · ${esc(p.rede)}</div></div><div class="right">${badge(STATUS_POST[p.status])}</div></button>`).join('')}</div>`
        : `<p class="vazio-txt" style="margin-top:12px">Nada em ${esc(diaSemana(c.dataset.dia))}.</p>`;
      $$('[data-ed]', d).forEach(b => b.onclick = () => editar(b.dataset.ed));
    });
  });
}

/* ----- Resultados (lançar números + metas) ----- */
function abaResultados() {
  const el = $('#aba'), c = conta(), D = S.D, mes = S.mesRes;
  const redes = c.redes.length ? c.redes : ['Instagram'];
  const valor = (r, k) => D.metricas.find(m => m.mes === mes && m.rede === r)?.[k] ?? '';
  const metasMes = D.metas.filter(m => m.mes === mes);
  el.innerHTML = `
    <div class="week-nav"><div><span class="lbl" style="display:block;margin-bottom:4px;color:var(--dim)">Lançar números de</span><h2>${esc(cap(mesNome(mes)))}</h2></div>
      <div class="ctrls"><button class="icon-btn" id="rm-ant" aria-label="Mês anterior">${ICON.prev}</button><button class="icon-btn" id="rm-prox" aria-label="Próximo mês">${ICON.next}</button></div></div>
    <form class="panel" id="f-met">
      <div class="panel-h"><h3>Números do mês por rede</h3><small class="vazio-txt">Deixe em branco o que não se aplica. As redes do cliente ficam em "Dados".</small></div>
      ${redes.map(r => `<fieldset class="met-rede" data-rede="${esc(r)}"><legend>${esc(r)}</legend>
        <div class="met-grid">${METRICAS.map(m => `<label class="met-campo"><span>${m.t}</span><input inputmode="decimal" data-k="${m.k}" value="${esc(valor(r, m.k))}" placeholder="—"></label>`).join('')}</div></fieldset>`).join('')}
      <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar números de ${esc(mesNome(mes))}</button></div>
    </form>
    <div class="panel">
      <h3>Metas de ${esc(mesNome(mes))}</h3>
      ${metasMes.length ? `<div class="list" style="margin-bottom:16px">${metasMes.map(m => `
        <div class="row" data-meta-id="${m.id}"><div style="min-width:0">${blocoMeta(m)}</div>
          <div class="right"><input class="inp inp-sm" data-atual inputmode="decimal" value="${String(m.atual).replace('.', ',')}" aria-label="Valor atual"><button class="btn btn-sm" data-salvar-meta>Atualizar</button><button class="btn btn-sm btn-danger" data-del-meta>Excluir</button></div></div>`).join('')}</div>` : '<p class="vazio-txt" style="margin-bottom:14px">Nenhuma meta neste mês.</p>'}
      <form class="grid-4" id="f-meta">
        <div class="field"><label for="mt-tit">Meta</label><input id="mt-tit" maxlength="120" placeholder="Ex.: Leads pelo Instagram"></div>
        <div class="field"><label for="mt-alvo">Alvo</label><input id="mt-alvo" inputmode="decimal" placeholder="50"></div>
        <div class="field"><label for="mt-atual">Atual</label><input id="mt-atual" inputmode="decimal" placeholder="0"></div>
        <div class="field"><label for="mt-un">Unidade</label><select id="mt-un">${UNIDADES.map(u => `<option value="${u}">${u || '(nenhuma)'}</option>`).join('')}</select></div>
        <div class="full"><button class="btn btn-primary" type="submit">${ICON.plus}Adicionar meta</button></div>
      </form>
    </div>
    <h3 class="section-h">Como o cliente vê</h3>
    <div class="panel" id="previa"></div>`;
  $('#rm-ant').onclick = () => { S.mesRes = addMeses(mes, -1); abaResultados(); };
  $('#rm-prox').onclick = () => { S.mesRes = addMeses(mes, 1); abaResultados(); };
  vistaResultados($('#previa'), { conta: c, metricas: D.metricas, metas: D.metas, mes, admin: true, aoMudarMes: m => { S.mesRes = m; abaResultados(); } });

  $('#f-met').onsubmit = async e => {
    e.preventDefault();
    const linhas = [];
    for (const fs of $$('.met-rede', el)) {
      const reg = { conta_id: S.sel, mes, rede: fs.dataset.rede }; let tem = false;
      for (const inp of $$('[data-k]', fs)) {
        const t = inp.value.trim();
        if (!t) { reg[inp.dataset.k] = null; continue; }
        const v = parseValor(t);
        if (!(v >= 0)) return toast(`Valor inválido em ${fs.dataset.rede}: ${t}`, true);
        reg[inp.dataset.k] = inp.dataset.k === 'investimento' ? v : Math.round(v); tem = true;
      }
      const existe = D.metricas.find(m => m.mes === mes && m.rede === fs.dataset.rede);
      if (tem || existe) linhas.push(reg);
    }
    if (!linhas.length) return toast('Preencha pelo menos um número.', true);
    const { error } = await sb.from('metricas').upsert(linhas, { onConflict: 'conta_id,mes,rede' });
    if (error) return toast(erroAmigavel(error), true);
    atualizar('Números salvos.');
  };
  $('#f-meta').onsubmit = async e => {
    e.preventDefault();
    const titulo = $('#mt-tit').value.trim(), alvo = parseValor($('#mt-alvo').value), atual = parseValor($('#mt-atual').value || '0');
    if (!titulo || !(alvo > 0)) return toast('Informe a meta e o alvo.', true);
    const { error } = await sb.from('metas').insert({ conta_id: S.sel, mes, titulo, alvo, atual: atual >= 0 ? atual : 0, unidade: $('#mt-un').value });
    if (error) return toast(erroAmigavel(error), true);
    atualizar('Meta adicionada.');
  };
  $$('[data-meta-id]', el).forEach(r => {
    const id = r.dataset.metaId;
    $('[data-salvar-meta]', r).onclick = async () => {
      const v = parseValor($('[data-atual]', r).value); if (!(v >= 0)) return toast('Valor inválido.', true);
      const { error } = await sb.from('metas').update({ atual: v }).eq('id', id);
      if (error) return toast(erroAmigavel(error), true); atualizar('Meta atualizada.');
    };
    $('[data-del-meta]', r).onclick = async () => {
      if (!confirm('Excluir essa meta?')) return;
      const { error } = await sb.from('metas').delete().eq('id', id);
      if (error) return toast(erroAmigavel(error), true); atualizar('Meta excluída.');
    };
  });
}

/* ----- Leads ----- */
function abaLeads() {
  const el = $('#aba'), fim = addMeses(S.mesLeads, 1);
  const lista = S.D.leads.filter(l => l.data >= S.mesLeads && l.data < fim).sort((a, b) => b.data.localeCompare(a.data));
  el.innerHTML = `
    <div class="week-nav"><div><h2>${esc(cap(mesNome(S.mesLeads)))}</h2></div>
      <div class="ctrls"><button class="btn btn-sm btn-primary" id="l-novo">${ICON.plus}Novo lead</button><button class="icon-btn" id="l-ant" aria-label="Mês anterior">${ICON.prev}</button><button class="icon-btn" id="l-prox" aria-label="Próximo mês">${ICON.next}</button></div></div>
    ${resumoLeads(lista)}
    ${lista.length ? `<div class="list" style="margin-top:18px">${lista.map(l => linhaLead(l, true)).join('')}</div>` : '<div class="empty-state" style="margin-top:18px">Nenhum lead neste mês.</div>'}`;
  $('#l-ant').onclick = () => { S.mesLeads = addMeses(S.mesLeads, -1); abaLeads(); };
  $('#l-prox').onclick = () => { S.mesLeads = addMeses(S.mesLeads, 1); abaLeads(); };
  $('#l-novo').onclick = () => formLead(null);
  $$('[data-lead]', el).forEach(r => {
    const l = S.D.leads.find(x => x.id === r.dataset.lead);
    $('[data-ed-lead]', r).onclick = () => formLead(l);
    $('[data-del-lead]', r).onclick = async () => {
      if (!confirm(`Excluir o lead ${l.nome}?`)) return;
      const { error } = await sb.from('leads').delete().eq('id', l.id);
      if (error) return toast(erroAmigavel(error), true); atualizar('Lead excluído.');
    };
  });
}
function formLead(l) {
  abrirModal(dlg, `<h2>${l ? 'Editar lead' : 'Novo lead'}</h2><p class="dsub">${esc(conta().nome)}</p>
    <form id="f-lead" novalidate><div class="grid-2">
      <div class="field full"><label for="ld-nome">Nome</label><input id="ld-nome" maxlength="120" value="${esc(l?.nome || '')}"></div>
      <div class="field"><label for="ld-cont">Contato</label><input id="ld-cont" maxlength="120" value="${esc(l?.contato || '')}"></div>
      <div class="field"><label for="ld-data">Data</label><input id="ld-data" type="date" value="${esc(l?.data || isoData(hoje()))}"></div>
      <div class="field"><label for="ld-orig">Origem</label><input id="ld-orig" list="ld-origens" maxlength="60" value="${esc(l?.origem || 'Instagram')}"><datalist id="ld-origens">${['Instagram', 'Anúncio Meta', 'Anúncio Google', 'WhatsApp', 'Site', 'Indicação', 'Outro'].map(o => `<option value="${o}">`).join('')}</datalist></div>
      <div class="field"><label for="ld-st">Status</label><select id="ld-st">${Object.entries(STATUS_LEAD).map(([k, [t]]) => `<option value="${k}"${k === (l?.status || 'novo') ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field full"><label for="ld-val">Valor vendido (R$)</label><input id="ld-val" inputmode="decimal" value="${l?.valor ? String(l.valor).replace('.', ',') : ''}"></div>
      <div class="field full"><label for="ld-obs">Observação</label><textarea id="ld-obs" maxlength="1000">${esc(l?.observacao || '')}</textarea></div>
    </div><div class="form-actions"><button class="btn btn-primary" type="submit">Salvar</button><button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div></form>`, d => {
    $('#f-lead', d).onsubmit = async e => {
      e.preventDefault();
      const nome = $('#ld-nome', d).value.trim(); if (!nome) return toast('Informe o nome.', true);
      const v = $('#ld-val', d).value.trim() ? parseValor($('#ld-val', d).value) : null;
      if (v !== null && !(v >= 0)) return toast('Valor inválido.', true);
      const reg = { conta_id: S.sel, nome, contato: $('#ld-cont', d).value.trim() || null, data: $('#ld-data', d).value || isoData(hoje()),
        origem: $('#ld-orig', d).value.trim() || 'Outro', status: $('#ld-st', d).value, valor: v, observacao: $('#ld-obs', d).value.trim() || null };
      const { error } = l ? await sb.from('leads').update(reg).eq('id', l.id) : await sb.from('leads').insert(reg);
      if (error) return toast(erroAmigavel(error), true);
      d.close(); atualizar('Lead salvo.');
    };
  });
}

/* ----- Relatórios ----- */
function abaRelatorios() {
  const el = $('#aba'), D = S.D, ed = S.editando ? D.rels.find(r => r.id === S.editando) : null;
  const mesF = ed?.mes || addMeses(mesISO(), -1);
  el.innerHTML = `
    <form class="panel" id="f-rel">
      <div class="panel-h"><h3>${ed ? 'Editar relatório' : 'Novo relatório'}</h3>${ed ? '<button class="btn btn-sm btn-ghost" type="button" id="cancelar-ed">Cancelar edição</button>' : ''}</div>
      <p class="vazio-txt" style="margin-bottom:14px">Os números entram sozinhos a partir da aba Resultados (lance antes). Aqui você escreve a análise.</p>
      <div class="grid-2">
        <div class="field"><label for="r-mes">Mês</label><input id="r-mes" type="month" value="${mesF.slice(0, 7)}"${ed ? ' disabled' : ''}></div>
        <div class="field"><span class="lbl">Situação</span><label class="check check-box"><input type="checkbox" id="r-pub"${ed?.publicado ? ' checked' : ''}> Publicado (o cliente vê e recebe aviso)</label></div>
        <div class="field full"><label for="r-res">Resumo do mês</label><textarea id="r-res" maxlength="2000" placeholder="Em poucas linhas: como foi o mês, o que mais chamou atenção.">${esc(ed?.resumo || '')}</textarea></div>
        <div class="field full"><label for="r-dest">Destaques (um por linha)</label><textarea id="r-dest" maxlength="2000" placeholder="Reels de bastidores bateu 12 mil views&#10;Recorde de mensagens no WhatsApp">${esc(ed?.destaques || '')}</textarea></div>
        <div class="field full"><label for="r-prox">Próximos passos (um por linha)</label><textarea id="r-prox" maxlength="2000" placeholder="Testar anúncio com vídeo&#10;Série de posts sobre os serviços">${esc(ed?.proximos_passos || '')}</textarea></div>
        <div class="field full"><span class="lbl">Melhores posts do mês (até 6, aparecem no relatório)</span><div class="pick" id="pick"></div></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${ed ? 'Salvar relatório' : 'Criar relatório'}</button>${ed ? `<a class="btn" href="/relatorio/?id=${ed.id}" target="_blank" rel="noopener">${ICON2.eye}Pré-visualizar</a>` : ''}</div>
    </form>
    <h3 class="section-h">Relatórios (${D.rels.length})</h3>
    ${D.rels.length ? `<div class="list">${D.rels.map(r => `<div class="row"><div><h4>${esc(cap(mesNome(r.mes)))}</h4><div class="sub">${r.publicado ? 'Publicado em ' + dataBR(r.publicado_em?.slice(0, 10)) : 'Rascunho: o cliente ainda não vê'}</div></div>
      <div class="right">${badge(r.publicado ? ['Publicado', 'b-ok'] : ['Rascunho', 'b-dim'])}<a class="btn btn-sm" href="/relatorio/?id=${r.id}" target="_blank" rel="noopener">Ver</a><button class="btn btn-sm" data-ed-rel="${r.id}">Editar</button><button class="btn btn-sm btn-danger" data-del-rel="${r.id}">Excluir</button></div></div>`).join('')}</div>` : '<p class="vazio-txt">Nenhum relatório ainda.</p>'}`;
  const pick = () => {
    const m = ed ? ed.mes : $('#r-mes').value + '-01', fim = addMeses(m, 1);
    const posts = D.posts.filter(p => p.data_publicacao >= m && p.data_publicacao < fim && p.midias?.length);
    const sel = ed?.posts_destaque || [];
    $('#pick').innerHTML = posts.length ? posts.map(p => `<label class="pick-i"><input type="checkbox" value="${p.id}"${sel.includes(p.id) ? ' checked' : ''}>
      ${ehVideo(p.midias[0]) ? `<video src="${esc(S.url(p.midias[0]))}" muted preload="metadata"></video>` : `<img src="${esc(S.url(p.midias[0]))}" alt="" loading="lazy">`}<span>${esc(p.titulo)}</span></label>`).join('')
      : '<p class="vazio-txt">Nenhuma postagem com mídia nesse mês.</p>';
  };
  pick(); $('#r-mes').onchange = pick;
  $('#cancelar-ed')?.addEventListener('click', () => { S.editando = null; abaRelatorios(); });
  $('#f-rel').onsubmit = async e => {
    e.preventDefault();
    const mes = ed ? ed.mes : $('#r-mes').value + '-01';
    if (!/^\d{4}-\d{2}-01$/.test(mes)) return toast('Escolha o mês.', true);
    const reg = { conta_id: S.sel, mes, resumo: $('#r-res').value.trim() || null, destaques: $('#r-dest').value.trim() || null,
      proximos_passos: $('#r-prox').value.trim() || null, publicado: $('#r-pub').checked, posts_destaque: $$('#pick input:checked').map(i => i.value).slice(0, 6) };
    const { data, error } = ed ? await sb.from('relatorios').update(reg).eq('id', ed.id).select().single() : await sb.from('relatorios').insert(reg).select().single();
    if (error) return toast(/duplicate|unique/i.test(error.message) ? 'Já existe um relatório desse mês. Edite o existente.' : erroAmigavel(error), true);
    S.editando = data.id; atualizar(reg.publicado ? 'Relatório publicado. O cliente foi avisado.' : 'Relatório salvo como rascunho.');
  };
  $$('[data-ed-rel]', el).forEach(b => b.onclick = () => { S.editando = b.dataset.edRel; abaRelatorios(); $('#f-rel').scrollIntoView({ behavior: 'smooth' }); });
  $$('[data-del-rel]', el).forEach(b => b.onclick = async () => {
    if (!confirm('Excluir esse relatório?')) return;
    const { error } = await sb.from('relatorios').delete().eq('id', b.dataset.delRel);
    if (error) return toast(erroAmigavel(error), true); S.editando = null; atualizar('Relatório excluído.');
  });
}

/* ----- Solicitações ----- */
function abaSolicitacoes() {
  const el = $('#aba'), lista = S.D.sols;
  el.innerHTML = lista.length ? `<div class="list">${lista.map(s => `
    <div class="row sol" data-sol="${s.id}">
      <div><h4>${esc(s.titulo)}</h4><div class="sub">${esc(s.tipo)} · ${esc(s.criado_por_nome || '—')} · ${dataBR(s.criado_em.slice(0, 10))}${s.prazo ? ` · <b>prazo ${dataBR(s.prazo)}</b>` : ''}</div>
        ${s.descricao ? `<p class="sol-desc">${esc(s.descricao)}</p>` : ''}
        <textarea class="inp inp-area" data-resp maxlength="2000" placeholder="Resposta para o cliente (opcional)" style="margin-top:10px;min-height:64px">${esc(s.resposta || '')}</textarea></div>
      <div class="right col">${badge(STATUS_SOL[s.status])}
        <select class="sel-sm" data-st aria-label="Status">${Object.entries(STATUS_SOL).map(([k, [t]]) => `<option value="${k}"${k === s.status ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <button class="btn btn-sm btn-primary" data-salvar>Salvar e avisar</button><button class="btn btn-sm btn-ghost" data-del>Excluir</button></div>
    </div>`).join('')}</div>` : '<div class="empty-state"><b>Nenhuma solicitação</b>Quando o cliente pedir algo pela área dele, aparece aqui e a equipe recebe um e-mail.</div>';
  $$('[data-sol]', el).forEach(r => {
    const id = r.dataset.sol;
    $('[data-salvar]', r).onclick = async () => {
      const { error } = await sb.from('solicitacoes').update({ status: $('[data-st]', r).value, resposta: $('[data-resp]', r).value.trim() || null, atualizado_em: new Date().toISOString() }).eq('id', id);
      if (error) return toast(erroAmigavel(error), true); atualizar('Solicitação atualizada. O cliente foi avisado.');
    };
    $('[data-del]', r).onclick = async () => {
      if (!confirm('Excluir essa solicitação?')) return;
      const { error } = await sb.from('solicitacoes').delete().eq('id', id);
      if (error) return toast(erroAmigavel(error), true); atualizar('Solicitação excluída.');
    };
  });
}

/* ----- Materiais ----- */
function abaMateriais() {
  const el = $('#aba'), todos = S.D.mats, f = S.filtroMat;
  const lista = f === 'todos' ? todos : todos.filter(m => m.status === f);
  el.innerHTML = `
    <div class="panel-h"><div class="seg seg-scroll" role="group" aria-label="Filtro">${[['novo', 'Novos'], ['usado', 'Já usados'], ['arquivado', 'Arquivados'], ['todos', 'Todos']].map(([k, t]) =>
      `<button type="button" data-f="${k}" aria-pressed="${f === k}">${t} (${k === 'todos' ? todos.length : todos.filter(m => m.status === k).length})</button>`).join('')}</div>
      <small class="vazio-txt">Espaço usado por este cliente: <b>${bytes(usoConta(S.sel))}</b></small></div>
    ${lista.length ? `<div class="mats">${lista.map(m => {
      const img = (m.tipo_mime || '').startsWith('image/'), vid = (m.tipo_mime || '').startsWith('video/');
      return `<div class="mat" data-mat="${m.id}">
        <div class="mat-prev">${img ? `<img src="${esc(S.urlMat(m.path))}" alt="" loading="lazy">` : `<span>${vid ? 'VÍDEO' : (m.nome_arquivo.split('.').pop() || 'arquivo').toUpperCase()}</span>`}</div>
        <div class="mat-info"><b title="${esc(m.nome_arquivo)}">${esc(m.nome_arquivo)}</b><small>${bytes(m.tamanho)} · ${esc(m.enviado_por_nome || '')} · ${dataBR(m.criado_em.slice(0, 10), { day: '2-digit', month: '2-digit' })}</small>
          ${m.observacao ? `<small class="mat-obs">${esc(m.observacao)}</small>` : ''}
          <div class="mat-acts"><select class="sel-sm" data-st aria-label="Status">${Object.entries(STATUS_MAT).map(([k, [t]]) => `<option value="${k}"${k === m.status ? ' selected' : ''}>${t}</option>`).join('')}</select>
            <button class="link" data-baixar>baixar</button><button class="link" data-apagar>apagar</button></div></div></div>`;
    }).join('')}</div>` : '<div class="empty-state">Nada por aqui.</div>'}
    ${todos.some(m => m.status !== 'novo') ? '<button class="btn btn-sm btn-danger" id="limpar" style="margin-top:18px">Apagar todos os já usados e arquivados (libera espaço)</button>' : ''}`;
  $$('[data-f]', el).forEach(b => b.onclick = () => { S.filtroMat = b.dataset.f; abaMateriais(); });
  $$('[data-mat]', el).forEach(c => {
    const m = todos.find(x => x.id === c.dataset.mat);
    $('[data-st]', c).onchange = async e => {
      const { error } = await sb.from('materiais').update({ status: e.target.value }).eq('id', m.id);
      if (error) return toast(erroAmigavel(error), true); atualizar('Material atualizado.');
    };
    $('[data-baixar]', c).onclick = () => baixar('materiais', m.path);
    $('[data-apagar]', c).onclick = async () => {
      if (!confirm(`Apagar "${m.nome_arquivo}"?`)) return;
      await sb.storage.from('materiais').remove([m.path]);
      const { error } = await sb.from('materiais').delete().eq('id', m.id);
      if (error) return toast(erroAmigavel(error), true); atualizar('Material apagado.');
    };
  });
  $('#limpar')?.addEventListener('click', async () => {
    const alvo = todos.filter(m => m.status !== 'novo');
    if (!confirm(`Apagar ${alvo.length} arquivo(s) já usados ou arquivados (${bytes(alvo.reduce((s, m) => s + Number(m.tamanho), 0))})? Não dá para desfazer.`)) return;
    await sb.storage.from('materiais').remove(alvo.map(m => m.path));
    const { error } = await sb.from('materiais').delete().in('id', alvo.map(m => m.id));
    if (error) return toast(erroAmigavel(error), true); atualizar('Espaço liberado.');
  });
}

/* ----- Pagamentos ----- */
function abaPagamentos() {
  const el = $('#aba'), D = S.D, ed = S.editando ? D.pags.find(p => p.id === S.editando) : null;
  const abertos = D.pags.filter(p => p.status === 'pendente').sort((a, b) => a.vencimento.localeCompare(b.vencimento)), outros = D.pags.filter(p => p.status !== 'pendente');
  el.innerHTML = `
    <form class="panel" id="f-pag">
      <div class="panel-h"><h3>${ed ? 'Editar pagamento' : 'Novo pagamento'}</h3>${ed ? '<button class="btn btn-sm btn-ghost" type="button" id="cancelar-ed">Cancelar edição</button>' : ''}</div>
      <div class="grid-3">
        <div class="field"><label for="g-desc">Descrição</label><input id="g-desc" maxlength="140" value="${esc(ed?.descricao || 'Mensalidade')}"></div>
        <div class="field"><label for="g-val">Valor (R$)</label><input id="g-val" inputmode="decimal" value="${ed ? String(ed.valor).replace('.', ',') : ''}" placeholder="1.500,00"></div>
        <div class="field"><label for="g-venc">Vencimento</label><input id="g-venc" type="date" value="${esc(ed?.vencimento || '')}"></div>
        <div class="field"><label for="g-link">Link de pagamento (opcional)</label><input id="g-link" type="url" maxlength="500" value="${esc(ed?.link_pagamento || '')}" placeholder="https://…"></div>
        <div class="field"><label for="g-obs">Observação (opcional)</label><input id="g-obs" maxlength="200" value="${esc(ed?.observacao || '')}"></div>
        ${ed ? `<div class="field"><label for="g-st">Status</label><select id="g-st">${[['pendente', 'Em aberto'], ['pago', 'Pago'], ['cancelado', 'Cancelado (cliente não vê)']].map(([k, t]) => `<option value="${k}"${ed.status === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>`
          : `<div class="field"><label for="g-rep">Repetir todo mês</label><select id="g-rep">${[1, 2, 3, 4, 6, 12].map(n => `<option value="${n}">${n === 1 ? 'Não repetir' : n + ' meses'}</option>`).join('')}</select></div>`}
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${ed ? 'Salvar' : 'Lançar pagamento'}</button></div>
    </form>
    <h3 class="section-h">Em aberto</h3>
    ${abertos.length ? `<div class="list">${abertos.map(linhaPag).join('')}</div>` : '<p class="vazio-txt">Nada em aberto.</p>'}
    ${outros.length ? `<h3 class="section-h">Pagos e cancelados</h3><div class="list">${outros.map(linhaPag).join('')}</div>` : ''}`;
  $('#cancelar-ed')?.addEventListener('click', () => { S.editando = null; abaPagamentos(); });
  $('#f-pag').onsubmit = async e => {
    e.preventDefault();
    const valor = parseValor($('#g-val').value), venc = $('#g-venc').value, desc = $('#g-desc').value.trim(), link = $('#g-link').value.trim();
    if (!desc || !venc || !(valor >= 0)) return toast('Preencha descrição, valor e vencimento.', true);
    if (link && !/^https?:\/\//i.test(link)) return toast('O link precisa começar com https://', true);
    const base = { conta_id: S.sel, descricao: desc, valor, link_pagamento: link || null, observacao: $('#g-obs').value.trim() || null };
    let error;
    if (ed) {
      const st = $('#g-st').value;
      ({ error } = await sb.from('pagamentos').update({ ...base, vencimento: venc, status: st, pago_em: st === 'pago' ? (ed.pago_em || isoData(hoje())) : null }).eq('id', ed.id));
    } else {
      const n = +$('#g-rep').value, d0 = parseData(venc);
      const linhas = Array.from({ length: n }, (_, i) => {
        const d = new Date(d0.getFullYear(), d0.getMonth() + i, 1);
        d.setDate(Math.min(d0.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
        return { ...base, vencimento: isoData(d) };
      });
      ({ error } = await sb.from('pagamentos').insert(linhas));
    }
    if (error) return toast(erroAmigavel(error), true);
    S.editando = null; atualizar(ed ? 'Pagamento atualizado.' : 'Pagamento lançado.');
  };
  $$('[data-pago]', el).forEach(b => b.onclick = async () => {
    const pago = b.dataset.acao === 'pagar';
    const { error } = await sb.from('pagamentos').update({ status: pago ? 'pago' : 'pendente', pago_em: pago ? isoData(hoje()) : null }).eq('id', b.dataset.pago);
    if (error) return toast(erroAmigavel(error), true); atualizar(pago ? 'Marcado como pago.' : 'Pagamento reaberto.');
  });
  $$('[data-ed-pag]', el).forEach(b => b.onclick = () => { S.editando = b.dataset.edPag; abaPagamentos(); $('#f-pag').scrollIntoView({ behavior: 'smooth' }); });
  $$('[data-del-pag]', el).forEach(b => b.onclick = async () => {
    if (!confirm('Excluir esse pagamento?')) return;
    const { error } = await sb.from('pagamentos').delete().eq('id', b.dataset.delPag);
    if (error) return toast(erroAmigavel(error), true); atualizar('Pagamento excluído.');
  });
}
function linhaPag(p) {
  return `<div class="row"><div><h4>${esc(p.descricao)} · ${dinheiro(p.valor)}</h4>
      <div class="sub">Vence ${dataBR(p.vencimento)}${p.pago_em ? ` · pago em ${dataBR(p.pago_em)}` : ''}${p.observacao ? ` · ${esc(p.observacao)}` : ''}${p.link_pagamento ? ' · com link' : ''}</div></div>
    <div class="right">${badge(statusPagamento(p))}
      ${p.status === 'pendente' ? `<button class="btn btn-sm btn-ok" data-pago="${p.id}" data-acao="pagar">Marcar pago</button>` : p.status === 'pago' ? `<button class="btn btn-sm btn-ghost" data-pago="${p.id}" data-acao="reabrir">Reabrir</button>` : ''}
      <button class="btn btn-sm" data-ed-pag="${p.id}">Editar</button><button class="btn btn-sm btn-danger" data-del-pag="${p.id}">Excluir</button></div></div>`;
}

/* ----- Documentos ----- */
function abaDocumentos() {
  const el = $('#aba'), docs = S.D.docs;
  el.innerHTML = `
    <form class="panel" id="f-doc">
      <h3>Adicionar documento</h3>
      <div class="grid-3">
        <div class="field"><label for="d-cat">Tipo</label><select id="d-cat">${['Contrato', 'Proposta', 'Briefing', 'Nota fiscal', 'Outro'].map(c => `<option>${c}</option>`).join('')}</select></div>
        <div class="field"><label for="d-tit">Título</label><input id="d-tit" maxlength="140" placeholder="Ex.: NF outubro/2026"></div>
        <div class="field"><label for="d-arq">Arquivo (PDF, imagem, Word, Excel)</label><input id="d-arq" type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"></div>
      </div>
      <p class="vazio-txt" style="margin-bottom:12px">Só pessoas com acesso completo veem os documentos. Quem tem avisos ligados recebe e-mail.</p>
      <button class="btn btn-primary" type="submit">Enviar documento</button>
    </form>
    ${docs.length ? `<div class="list">${docs.map(d => `<div class="row"><div><h4>${esc(d.titulo)}</h4><div class="sub">${esc(d.categoria)} · ${dataBR(d.criado_em.slice(0, 10))} · ${bytes(d.tamanho)}</div></div>
      <div class="right"><button class="btn btn-sm" data-baixar="${d.id}">${ICON2.down}Baixar</button><button class="btn btn-sm btn-danger" data-del-doc="${d.id}">Excluir</button></div></div>`).join('')}</div>` : '<p class="vazio-txt">Nenhum documento.</p>'}`;
  $('#f-doc').onsubmit = async e => {
    e.preventDefault();
    const f = $('#d-arq').files[0], titulo = $('#d-tit').value.trim() || f?.name;
    if (!f) return toast('Escolha o arquivo.', true);
    if (f.size > LIMITE_ARQUIVO) return toast('Arquivo passa de 50 MB.', true);
    const btn = e.submitter; btn.disabled = true; btn.textContent = 'Enviando…';
    const volta = () => { btn.disabled = false; btn.textContent = 'Enviar documento'; };
    const path = `${S.sel}/${crypto.randomUUID().slice(0, 8)}-${nomeSeguro(f.name)}`;
    const up = await sb.storage.from('documentos').upload(path, f, { contentType: f.type || 'application/octet-stream' });
    if (up.error) { volta(); return toast(erroAmigavel(up.error), true); }
    const { error } = await sb.from('documentos').insert({ conta_id: S.sel, categoria: $('#d-cat').value, titulo, path, nome_arquivo: f.name, tamanho: f.size });
    if (error) { await sb.storage.from('documentos').remove([path]); volta(); return toast(erroAmigavel(error), true); }
    atualizar('Documento enviado.');
  };
  $$('[data-baixar]', el).forEach(b => b.onclick = () => baixar('documentos', docs.find(d => d.id === b.dataset.baixar).path));
  $$('[data-del-doc]', el).forEach(b => b.onclick = async () => {
    const d = docs.find(x => x.id === b.dataset.delDoc);
    if (!confirm(`Excluir "${d.titulo}"?`)) return;
    await sb.storage.from('documentos').remove([d.path]);
    const { error } = await sb.from('documentos').delete().eq('id', d.id);
    if (error) return toast(erroAmigavel(error), true); atualizar('Documento excluído.');
  });
}

/* ----- Acessos ----- */
function abaAcessos() {
  blocoAcessos($('#aba'), { contaId: S.sel, acessos: S.D.acs, aoMudar: () => atualizar() });
}

/* ----- Indicações ----- */
function abaIndicacoes() {
  const el = $('#aba'), D = S.D;
  const ganho = D.inds.filter(i => i.status === 'fechou').reduce((s, i) => s + Number(i.desconto_valor || 0), 0);
  const aAplicar = D.inds.filter(i => i.status === 'fechou' && !i.desconto_aplicado).reduce((s, i) => s + Number(i.desconto_valor || 0), 0);
  el.innerHTML = `
    <div class="kpis"><div class="kpi"><span class="lbl">Indicações</span><strong>${D.inds.length}</strong></div>
      <div class="kpi"><span class="lbl">Desconto total</span><strong>${dinheiro(ganho)}</strong></div>
      <div class="kpi"><span class="lbl">Falta aplicar</span><strong>${dinheiro(aAplicar)}</strong></div></div>
    ${D.inds.length ? `<div class="list" style="margin-top:14px">${D.inds.map(i => `
      <div class="row" data-ind="${i.id}">
        <div><h4>${esc(i.nome_indicado)}</h4><div class="sub">${esc(i.contato || 'sem contato')} · ${dataBR(i.criado_em.slice(0, 10))}${i.observacao ? `<br>${esc(i.observacao)}` : ''}</div></div>
        <div class="right">
          <select class="sel-sm" data-k="status" aria-label="Status">${Object.entries(STATUS_IND).map(([k, [t]]) => `<option value="${k}"${k === i.status ? ' selected' : ''}>${t}</option>`).join('')}</select>
          <input class="inp inp-sm" data-k="desconto_valor" inputmode="decimal" aria-label="Desconto em reais" placeholder="Desconto R$" value="${Number(i.desconto_valor) ? String(i.desconto_valor).replace('.', ',') : ''}">
          <label class="check"><input type="checkbox" data-k="desconto_aplicado"${i.desconto_aplicado ? ' checked' : ''}>aplicado</label>
          <button class="btn btn-sm" data-salvar>Salvar</button><button class="btn btn-sm btn-danger" data-del>Excluir</button>
        </div></div>`).join('')}</div>` : '<div class="empty-state" style="margin-top:14px">Nenhuma indicação deste cliente.</div>'}`;
  $$('[data-ind]', el).forEach(r => {
    const id = r.dataset.ind;
    $('[data-salvar]', r).onclick = async () => {
      const v = parseValor($('[data-k=desconto_valor]', r).value || '0'); if (!(v >= 0)) return toast('Desconto inválido.', true);
      const { error } = await sb.from('indicacoes').update({ status: $('[data-k=status]', r).value, desconto_valor: v, desconto_aplicado: $('[data-k=desconto_aplicado]', r).checked }).eq('id', id);
      if (error) return toast(erroAmigavel(error), true); atualizar('Indicação atualizada.');
    };
    $('[data-del]', r).onclick = async () => {
      if (!confirm('Excluir essa indicação?')) return;
      const { error } = await sb.from('indicacoes').delete().eq('id', id);
      if (error) return toast(erroAmigavel(error), true); atualizar('Indicação excluída.');
    };
  });
}

/* ----- Pessoas (logins da conta) ----- */
function abaPessoas() {
  const el = $('#aba'), c = conta(), lista = membros(c.id);
  el.innerHTML = `
    <div class="panel-h"><p class="vazio-txt" style="max-width:560px"><b>Acesso completo</b>: vê tudo, inclusive pagamentos, documentos e senhas. <b>Só conteúdo</b>: planejamento, resultados, relatórios, materiais e solicitações.</p>
      <button class="btn btn-primary btn-sm" id="add-pessoa">${ICON.plus}Adicionar pessoa</button></div>
    ${lista.length ? `<div class="list">${lista.map(p => `
      <div class="row" data-p="${p.id}">
        <div><h4>${esc(p.nome)}${p.ativo ? '' : ' <span class="badge b-dim">suspenso</span>'}</h4><div class="sub">${esc(p.email || '')}${p.telefone ? ' · ' + esc(p.telefone) : ''}${p.receber_emails ? '' : ' · avisos desligados'}</div></div>
        <div class="right">
          <select class="sel-sm" data-perm aria-label="Permissão"><option value="completo"${p.permissao === 'completo' ? ' selected' : ''}>Acesso completo</option><option value="conteudo"${p.permissao === 'conteudo' ? ' selected' : ''}>Só conteúdo</option></select>
          <button class="btn btn-sm" data-acesso>Senha / e-mail</button>
          <button class="btn btn-sm" data-ativo>${p.ativo ? 'Suspender' : 'Reativar'}</button>
          <button class="btn btn-sm btn-danger" data-del>Excluir</button>
        </div></div>`).join('')}</div>` : '<div class="empty-state"><b>Ninguém tem acesso ainda</b>Adicione pelo menos uma pessoa para o cliente entrar.</div>'}`;
  $('#add-pessoa').onclick = () => dialogoPessoa(c);
  $$('[data-p]', el).forEach(r => {
    const p = lista.find(x => x.id === r.dataset.p);
    $('[data-perm]', r).onchange = async e => {
      const { error } = await sb.from('perfis').update({ permissao: e.target.value }).eq('id', p.id);
      if (error) return toast(erroAmigavel(error), true); atualizar('Permissão atualizada.');
    };
    $('[data-acesso]', r).onclick = () => dialogoAcessoPessoa(p);
    $('[data-ativo]', r).onclick = async () => {
      if (p.ativo && !confirm(`Suspender o acesso de ${p.nome}?`)) return;
      try { await chamarFuncao({ acao: 'ativar', id: p.id, ativo: !p.ativo }); atualizar(p.ativo ? 'Acesso suspenso.' : 'Acesso reativado.'); } catch (err) { toast(erroAmigavel(err), true); }
    };
    $('[data-del]', r).onclick = async () => {
      if (!confirm(`Excluir o login de ${p.nome}? Os dados da conta continuam.`)) return;
      try { await chamarFuncao({ acao: 'excluir_usuario', id: p.id }); atualizar('Login excluído.'); } catch (err) { toast(erroAmigavel(err), true); }
    };
  });
}

function dialogoPessoa(c) {
  abrirModal(dlg, `<h2>Adicionar pessoa</h2><p class="dsub">Novo login na área da ${esc(c.nome)}. Todos entram na mesma área.</p>
    <form id="f-p" novalidate><div class="grid-2">
      <div class="field full"><label for="np-nome">Nome</label><input id="np-nome" maxlength="120" placeholder="Ex.: Miguel Souza"></div>
      <div class="field"><label for="np-email">E-mail de login</label><input id="np-email" type="email" autocomplete="off"></div>
      <div class="field"><label for="np-tel">Telefone (opcional)</label><input id="np-tel" maxlength="30" inputmode="tel"></div>
      <div class="field"><label for="np-senha">Senha inicial</label><input id="np-senha" autocomplete="off" value="${gerarSenha()}"></div>
      <div class="field"><label for="np-perm">Permissão</label><select id="np-perm"><option value="completo">Acesso completo</option><option value="conteudo">Só conteúdo</option></select></div>
    </div><div id="np-msg" class="form-msg err" hidden></div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Criar login</button><button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div></form>`, d => {
    $('#f-p', d).onsubmit = async e => {
      e.preventDefault();
      const body = { acao: 'criar_usuario', papel: 'cliente', conta_id: c.id, nome: $('#np-nome', d).value.trim(), email: $('#np-email', d).value.trim(),
        telefone: $('#np-tel', d).value.trim(), senha: $('#np-senha', d).value, permissao: $('#np-perm', d).value };
      if (!body.nome || !body.email) return msgErro('#np-msg', 'Preencha nome e e-mail.');
      if (body.senha.length < 8) return msgErro('#np-msg', 'A senha precisa ter pelo menos 8 caracteres.');
      e.submitter.disabled = true; e.submitter.textContent = 'Criando…';
      try { await chamarFuncao(body); await atualizar(); mostrarAcesso(body.nome, body.email, body.senha); }
      catch (err) { msgErro('#np-msg', erroAmigavel(err)); e.submitter.disabled = false; e.submitter.textContent = 'Criar login'; }
    };
  });
}

function dialogoAcessoPessoa(p, aoFim = () => atualizar()) {
  abrirModal(dlg, `<h2>${esc(p.nome)}</h2><p class="dsub">Altere o e-mail de login ou defina uma nova senha.</p>
    <form id="f-em" class="field"><label for="ae-email">E-mail de login</label><input id="ae-email" type="email" value="${esc(p.email || '')}"><div class="form-actions"><button class="btn btn-sm" type="submit">Alterar e-mail</button></div></form>
    <form id="f-sn" class="field" style="margin-top:10px"><label for="ae-senha">Nova senha</label><input id="ae-senha" autocomplete="off" placeholder="Mínimo 8 caracteres">
      <div class="form-actions"><button class="btn btn-sm btn-primary" type="submit">Definir senha</button><button class="btn btn-sm btn-ghost" type="button" id="ae-gerar">Gerar senha</button></div></form>
    <p class="vazio-txt" style="margin-top:10px">A pessoa também pode usar "Esqueci minha senha" na tela de login.</p>`, d => {
    $('#ae-gerar', d).onclick = () => { $('#ae-senha', d).value = gerarSenha(); };
    $('#f-em', d).onsubmit = async e => {
      e.preventDefault();
      try { await chamarFuncao({ acao: 'alterar_email', id: p.id, email: $('#ae-email', d).value.trim() }); d.close(); aoFim(); toast('E-mail alterado.'); } catch (err) { toast(erroAmigavel(err), true); }
    };
    $('#f-sn', d).onsubmit = async e => {
      e.preventDefault();
      const senha = $('#ae-senha', d).value; if (senha.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres.', true);
      try { await chamarFuncao({ acao: 'redefinir_senha', id: p.id, senha }); mostrarAcesso(p.nome, p.email, senha, p.papel === 'admin'); } catch (err) { toast(erroAmigavel(err), true); }
    };
  });
}

/* ----- Dados da conta ----- */
function abaDados() {
  const el = $('#aba'), c = conta(), pj = c.tipo_pessoa === 'pj';
  el.innerHTML = `
    <form class="panel" id="f-dados">
      <h3>Dados do cliente</h3>
      <div class="seg" role="group" aria-label="Tipo"><button type="button" data-tipo="pj" aria-pressed="${pj}">Empresa</button><button type="button" data-tipo="pf" aria-pressed="${!pj}">Pessoa física</button></div>
      <div class="grid-2">
        <div class="field full"><label for="dc-nome" data-lbl-nome>${pj ? 'Nome da empresa' : 'Nome completo'}</label><input id="dc-nome" maxlength="140" value="${esc(c.nome)}"></div>
        <div class="field"><label for="dc-doc" data-lbl-doc>${pj ? 'CNPJ' : 'CPF'} (opcional)</label><input id="dc-doc" inputmode="numeric" value="${esc(mascaraDoc(c.documento, pj))}"></div>
        <div class="field"><label for="dc-tel">Telefone / WhatsApp</label><input id="dc-tel" maxlength="30" inputmode="tel" value="${esc(c.telefone || '')}"></div>
        <div class="field full"><span class="lbl">Redes que a MLX gerencia (aparecem em Resultados)</span>
          <div class="checks">${REDES.map(r => `<label class="chip-check"><input type="checkbox" value="${r}"${c.redes.includes(r) ? ' checked' : ''}><span>${r}</span></label>`).join('')}</div></div>
        <div class="field full"><label class="check check-box"><input type="checkbox" id="dc-leads"${c.modulo_leads ? ' checked' : ''}> <span><b>Acompanhamento de leads</b>: mostra a aba Leads para este cliente</span></label></div>
        <div class="field full"><label for="dc-obs">Observações internas (cliente não vê)</label><textarea id="dc-obs" maxlength="2000">${esc(c.observacoes || '')}</textarea></div>
      </div>
      <div id="dc-msg" class="form-msg err" hidden></div>
      <button class="btn btn-primary" type="submit">Salvar dados</button>
    </form>
    <div class="panel"><h3>Zona de cuidado</h3>
      <div class="form-actions">
        <button class="btn" id="b-ativo">${c.ativo ? 'Suspender acesso do cliente' : 'Reativar acesso do cliente'}</button>
        <button class="btn btn-danger" id="b-excluir">Excluir cliente e todos os dados</button>
      </div>
      <p class="vazio-txt" style="margin-top:10px">Suspender bloqueia o login de todas as pessoas da conta, sem apagar nada.</p></div>`;
  let tipo = c.tipo_pessoa;
  const doc = $('#dc-doc');
  $$('[data-tipo]', el).forEach(b => b.onclick = () => {
    tipo = b.dataset.tipo; const ehPj = tipo === 'pj';
    $$('[data-tipo]', el).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.tipo === tipo)));
    $('[data-lbl-nome]', el).textContent = ehPj ? 'Nome da empresa' : 'Nome completo';
    $('[data-lbl-doc]', el).textContent = (ehPj ? 'CNPJ' : 'CPF') + ' (opcional)';
    doc.value = mascaraDoc(doc.value, ehPj);
  });
  doc.oninput = () => { doc.value = mascaraDoc(doc.value, tipo === 'pj'); };
  $('#f-dados').onsubmit = async e => {
    e.preventDefault();
    const nome = $('#dc-nome').value.trim(), d = soDigitos(doc.value) || null;
    if (!nome) return msgErro('#dc-msg', 'Informe o nome.');
    if (d && tipo === 'pj' && !cnpjOk(d)) return msgErro('#dc-msg', 'CNPJ inválido.');
    if (d && tipo === 'pf' && !cpfOk(d)) return msgErro('#dc-msg', 'CPF inválido.');
    const redes = $$('.checks input:checked', el).map(i => i.value);
    const { error } = await sb.from('contas').update({ tipo_pessoa: tipo, nome, documento: d, telefone: $('#dc-tel').value.trim() || null, redes: redes.length ? redes : ['Instagram'],
      modulo_leads: $('#dc-leads').checked, observacoes: $('#dc-obs').value.trim() || null }).eq('id', c.id);
    if (error) return msgErro('#dc-msg', erroAmigavel(error));
    atualizar('Dados salvos.');
  };
  $('#b-ativo').onclick = async () => {
    if (c.ativo && !confirm(`Suspender o acesso de todas as pessoas da ${c.nome}?`)) return;
    try { await chamarFuncao({ acao: 'ativar_conta', conta_id: c.id, ativo: !c.ativo }); atualizar(c.ativo ? 'Cliente suspenso.' : 'Cliente reativado.'); } catch (err) { toast(erroAmigavel(err), true); }
  };
  $('#b-excluir').onclick = async () => {
    const t = prompt(`Isso apaga a ${c.nome}: logins, postagens, fotos, materiais, documentos, senhas, pagamentos, relatórios e histórico. Não dá para desfazer.\n\nDigite EXCLUIR para confirmar:`);
    if (t !== 'EXCLUIR') return;
    try { await chamarFuncao({ acao: 'excluir_conta', conta_id: c.id }); S.vista = 'geral'; S.sel = null; await recarregarBase(); render(); toast('Cliente excluído.'); }
    catch (err) { toast(erroAmigavel(err), true); }
  };
}

function abaHistorico() { $('#aba').innerHTML = listaAtividades(S.D.ativ); }

/* ---------- Equipe MLX ---------- */
function vistaPessoaEquipe() {
  const p = S.perfis.find(x => x.id === S.pessoa); if (!p) { S.vista = 'geral'; return vistaGeral(); }
  const souEu = p.id === S.eu.id;
  $('#main').innerHTML = `${barraMobile()}
    <div class="main-head"><div><h1>${esc(p.nome)}</h1><p>${esc(p.email || '')} · Equipe MLX${p.ativo ? '' : ' · suspenso'}</p></div></div>
    <form class="panel" id="f-eq"><h3>Dados</h3><div class="grid-2">
      <div class="field"><label for="eq-nome">Nome</label><input id="eq-nome" maxlength="120" value="${esc(p.nome)}"></div>
      <div class="field"><label for="eq-tel">Telefone</label><input id="eq-tel" maxlength="30" value="${esc(p.telefone || '')}"></div></div>
      <button class="btn btn-primary" type="submit">Salvar</button></form>
    <div class="panel"><h3>Acesso</h3><div class="form-actions"><button class="btn" id="eq-acesso">Senha / e-mail</button>
      ${souEu ? '' : `<button class="btn" id="eq-ativo">${p.ativo ? 'Suspender' : 'Reativar'}</button><button class="btn btn-danger" id="eq-del">Excluir login</button>`}</div></div>`;
  ligarVoltar();
  const depois = async m => { toast(m); await recarregarBase(); render(); };
  $('#f-eq').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.from('perfis').update({ nome: $('#eq-nome').value.trim(), telefone: $('#eq-tel').value.trim() || null }).eq('id', p.id);
    if (error) return toast(erroAmigavel(error), true); depois('Dados salvos.');
  };
  $('#eq-acesso').onclick = () => dialogoAcessoPessoa(p, async () => { await recarregarBase(); render(); });
  $('#eq-ativo')?.addEventListener('click', async () => {
    try { await chamarFuncao({ acao: 'ativar', id: p.id, ativo: !p.ativo }); depois(p.ativo ? 'Acesso suspenso.' : 'Acesso reativado.'); } catch (err) { toast(erroAmigavel(err), true); }
  });
  $('#eq-del')?.addEventListener('click', async () => {
    if (prompt(`Excluir o login de ${p.nome}? Digite EXCLUIR:`) !== 'EXCLUIR') return;
    try { await chamarFuncao({ acao: 'excluir_usuario', id: p.id }); S.vista = 'geral'; depois('Login excluído.'); } catch (err) { toast(erroAmigavel(err), true); }
  });
}
function dialogoNovaEquipe() {
  abrirModal(dlg, `<h2>Adicionar alguém da equipe</h2><p class="dsub">Essa pessoa terá acesso total ao painel admin.</p>
    <form id="f-ne" novalidate>
      <div class="field"><label for="ne-nome">Nome</label><input id="ne-nome" maxlength="120"></div>
      <div class="field"><label for="ne-email">E-mail de login</label><input id="ne-email" type="email" autocomplete="off"></div>
      <div class="field"><label for="ne-senha">Senha inicial</label><input id="ne-senha" autocomplete="off" value="${gerarSenha()}"></div>
      <div id="ne-msg" class="form-msg err" hidden></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Adicionar à equipe</button><button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div></form>`, d => {
    $('#f-ne', d).onsubmit = async e => {
      e.preventDefault();
      const body = { acao: 'criar_usuario', papel: 'admin', nome: $('#ne-nome', d).value.trim(), email: $('#ne-email', d).value.trim(), senha: $('#ne-senha', d).value };
      if (!body.nome || !body.email) return msgErro('#ne-msg', 'Preencha nome e e-mail.');
      if (body.senha.length < 8) return msgErro('#ne-msg', 'A senha precisa ter pelo menos 8 caracteres.');
      e.submitter.disabled = true;
      try { const r = await chamarFuncao(body); await recarregarBase(); S.vista = 'pessoa'; S.pessoa = r.id; render(); mostrarAcesso(body.nome, body.email, body.senha, true); }
      catch (err) { msgErro('#ne-msg', erroAmigavel(err)); e.submitter.disabled = false; }
    };
  });
}

/* ---------- Novo cliente ---------- */
function dialogoNovaConta() {
  abrirModal(dlg, `<h2>Novo cliente</h2><p class="dsub">Cadastre o cliente e a primeira pessoa que vai acessar. Sócios e funcionários você adiciona depois em "Pessoas".</p>
    <form id="f-nc" novalidate>
      <div class="seg" role="group" aria-label="Tipo"><button type="button" data-tipo="pj" aria-pressed="true">Empresa</button><button type="button" data-tipo="pf" aria-pressed="false">Pessoa física</button></div>
      <div class="grid-2">
        <div class="field full"><label for="nc-nome" data-lbl-nome>Nome da empresa</label><input id="nc-nome" maxlength="140" placeholder="Ex.: Pousada Recanto"></div>
        <div class="field"><label for="nc-doc" data-lbl-doc>CNPJ (opcional)</label><input id="nc-doc" inputmode="numeric" autocomplete="off" placeholder="00.000.000/0000-00"></div>
        <div class="field"><label for="nc-tel">Telefone / WhatsApp</label><input id="nc-tel" maxlength="30" inputmode="tel" placeholder="(16) 99999-9999"></div>
      </div>
      <h3 class="form-sub">Primeiro acesso</h3>
      <div class="grid-2">
        <div class="field full" data-so-pj><label for="nc-resp">Nome de quem vai acessar</label><input id="nc-resp" maxlength="120" placeholder="Ex.: Fabrício Lima"></div>
        <div class="field"><label for="nc-email">E-mail de login</label><input id="nc-email" type="email" autocomplete="off"></div>
        <div class="field"><label for="nc-senha">Senha inicial</label><input id="nc-senha" autocomplete="off" value="${gerarSenha()}"></div>
      </div>
      <div id="nc-msg" class="form-msg err" hidden></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Criar cliente</button><button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div>
    </form>`, d => {
    let tipo = 'pj';
    const doc = $('#nc-doc', d);
    $$('[data-tipo]', d).forEach(b => b.onclick = () => {
      tipo = b.dataset.tipo; const pj = tipo === 'pj';
      $$('[data-tipo]', d).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.tipo === tipo)));
      $$('[data-so-pj]', d).forEach(x => x.hidden = !pj);
      $('[data-lbl-nome]', d).textContent = pj ? 'Nome da empresa' : 'Nome completo';
      $('#nc-nome', d).placeholder = pj ? 'Ex.: Pousada Recanto' : 'Ex.: Maria Souza';
      $('[data-lbl-doc]', d).textContent = (pj ? 'CNPJ' : 'CPF') + ' (opcional)';
      doc.placeholder = pj ? '00.000.000/0000-00' : '000.000.000-00';
      doc.value = mascaraDoc(doc.value, pj);
    });
    doc.oninput = () => { doc.value = mascaraDoc(doc.value, tipo === 'pj'); };
    $('#f-nc', d).onsubmit = async e => {
      e.preventDefault();
      const pj = tipo === 'pj', nome = $('#nc-nome', d).value.trim(), dd = soDigitos(doc.value) || null;
      const pessoa = pj ? $('#nc-resp', d).value.trim() : nome, email = $('#nc-email', d).value.trim(), senha = $('#nc-senha', d).value;
      if (!nome) return msgErro('#nc-msg', pj ? 'Informe o nome da empresa.' : 'Informe o nome completo.');
      if (dd && pj && !cnpjOk(dd)) return msgErro('#nc-msg', 'CNPJ inválido. Confira ou deixe em branco.');
      if (dd && !pj && !cpfOk(dd)) return msgErro('#nc-msg', 'CPF inválido. Confira ou deixe em branco.');
      if (!pessoa) return msgErro('#nc-msg', 'Informe o nome de quem vai acessar.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msgErro('#nc-msg', 'E-mail inválido.');
      if (senha.length < 8) return msgErro('#nc-msg', 'A senha precisa ter pelo menos 8 caracteres.');
      const btn = e.submitter; btn.disabled = true; btn.textContent = 'Criando…';
      const { data: c, error } = await sb.from('contas').insert({ tipo_pessoa: tipo, nome, documento: dd, telefone: $('#nc-tel', d).value.trim() || null }).select().single();
      if (error) { btn.disabled = false; btn.textContent = 'Criar cliente'; return msgErro('#nc-msg', erroAmigavel(error)); }
      try {
        await chamarFuncao({ acao: 'criar_usuario', papel: 'cliente', conta_id: c.id, nome: pessoa, email, senha, telefone: $('#nc-tel', d).value.trim(), permissao: 'completo' });
      } catch (err) {
        await sb.from('contas').delete().eq('id', c.id);
        btn.disabled = false; btn.textContent = 'Criar cliente'; return msgErro('#nc-msg', erroAmigavel(err));
      }
      await recarregarBase(); S.aba = 'pessoas'; await abrirConta(c.id);
      mostrarAcesso(pessoa, email, senha);
    };
  });
}

function mostrarAcesso(nome, email, senha, equipe = false) {
  const link = equipe ? 'https://mlxmind.com.br/admin' : 'https://mlxmind.com.br/cliente';
  const txt = `Olá, ${nome.split(' ')[0]}! ${equipe ? 'Seu acesso ao painel da MLX Mind está pronto.' : 'Sua área do cliente da MLX Mind está pronta.'}\n\nAcesse: ${link}\nE-mail: ${email}\nSenha: ${senha}\n\n${equipe ? '' : 'Lá você acompanha o planejamento, aprova os posts, vê resultados e relatórios, envia materiais e fala com a gente.\n\n'}Recomendamos trocar a senha no primeiro acesso, em "Minha conta".`;
  abrirModal(dlg, `<h2>Acesso pronto ✔</h2><p class="dsub">Envie esses dados para ${esc(nome)}. A senha não fica visível depois.</p>
    <textarea class="inp inp-area" style="min-height:200px" readonly>${esc(txt)}</textarea>
    <div class="form-actions" style="margin-top:14px"><button class="btn btn-primary" id="cp-acesso">${ICON.copy}Copiar mensagem</button>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(txt)}">${ICON.wa}Enviar no WhatsApp</a><button class="btn btn-ghost" data-fechar>Fechar</button></div>`,
    d => { $('#cp-acesso', d).onclick = () => copiar(txt); });
}
