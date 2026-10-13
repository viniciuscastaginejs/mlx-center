/* =========================================================
   MLX Mind · Painel admin
   ========================================================= */
import {
  sb, BUCKET, $, $$, esc, dinheiro, parseData, isoData, hoje, dataBR, diaSemana, iniciais, ehVideo,
  STATUS_POST, STATUS_IND, statusPagamento, badge, urlsAssinadas, toast, erroAmigavel, copiar,
  montarLogin, montarNovaSenha, LOGO, ICON
} from './comum.js';

const app = $('#app'), topUser = $('#top-user'), dlg = $('#dlg');
$('#logo').outerHTML = LOGO;

const S = {
  uid: null, eu: null, perfis: [], config: {}, alertas: { ajustes: [], atrasados: [], novas: [] },
  vista: 'geral', sel: null, aba: 'postagens', busca: '',
  dados: { posts: [], pags: [], inds: [] }, url: () => '', editando: null
};
let recuperando = false;

const REDES = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'YouTube', 'Google', 'Outro'];
const FORMATOS = ['Post', 'Carrossel', 'Reels', 'Stories', 'Outro'];

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
    <a class="btn btn-sm" href="/cliente/">Ver como cliente</a>
    <button class="btn btn-sm btn-ghost" id="sair">${ICON.out}Sair</button>`;
  topUser.hidden = false;
  $('#sair').onclick = () => sb.auth.signOut();
  await recarregarBase();
  render();
}

async function recarregarBase() {
  const [perfis, config, ajustes, atrasados, novas] = await Promise.all([
    sb.from('perfis').select('*').order('nome'),
    sb.from('configuracoes').select('*').eq('id', 1).single(),
    sb.from('postagens').select('id,cliente_id,titulo,data_publicacao,comentario_cliente,status').in('status', ['ajuste_solicitado', 'aguardando_aprovacao']).order('data_publicacao'),
    sb.from('pagamentos').select('id,cliente_id,descricao,valor,vencimento,status').eq('status', 'pendente').lt('vencimento', isoData(hoje())).order('vencimento'),
    sb.from('indicacoes').select('id,cliente_id,nome_indicado,contato,criado_em,status').eq('status', 'nova').order('criado_em', { ascending: false })
  ]);
  const erro = [perfis, config, ajustes, atrasados, novas].find(r => r.error);
  if (erro) toast(erroAmigavel(erro.error), true);
  S.perfis = perfis.data || [];
  S.config = config.data || {};
  S.alertas = {
    ajustes: (ajustes.data || []).filter(p => p.status === 'ajuste_solicitado'),
    aguardando: (ajustes.data || []).filter(p => p.status === 'aguardando_aprovacao'),
    atrasados: atrasados.data || [],
    novas: novas.data || []
  };
}

const nomeDe = id => S.perfis.find(p => p.id === id)?.nome || '—';
const sel = () => S.perfis.find(p => p.id === S.sel);

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

/* ---------- layout ---------- */
function render() {
  app.innerHTML = `
  <div class="admin">
    <aside class="side" aria-label="Clientes">
      <button class="btn btn-primary" id="novo-cli">${ICON.plus}Novo cliente</button>
      <input class="inp" id="busca" type="search" placeholder="Buscar cliente…" value="${esc(S.busca)}" aria-label="Buscar cliente">
      <div class="side-list" id="side-list"></div>
    </aside>
    <section class="main" id="main"></section>
  </div>`;
  $('#novo-cli').onclick = () => dialogoNovoUsuario('cliente');
  $('#busca').oninput = e => { S.busca = e.target.value; renderLista(); };
  renderLista();
  renderMain();
}

function renderLista() {
  const q = S.busca.toLowerCase().trim();
  const bate = p => !q || [p.nome, p.empresa, p.email].some(v => (v || '').toLowerCase().includes(q));
  const temAlerta = id => S.alertas.ajustes.some(x => x.cliente_id === id) || S.alertas.novas.some(x => x.cliente_id === id) || S.alertas.atrasados.some(x => x.cliente_id === id);
  const item = p => `<button class="side-item${p.ativo ? '' : ' off'}" data-id="${p.id}" aria-current="${S.vista === 'cliente' && S.sel === p.id}">
      <span class="av">${esc(iniciais(p.nome))}</span>
      <span class="t"><b>${esc(p.nome || p.email)}</b><small>${esc(p.empresa || p.email || '')}${p.ativo ? '' : ' · suspenso'}</small></span>
      ${temAlerta(p.id) ? '<span class="dot" title="Tem pendência"></span>' : ''}
    </button>`;
  const clientes = S.perfis.filter(p => p.papel === 'cliente' && bate(p));
  const equipe = S.perfis.filter(p => p.papel === 'admin' && bate(p));
  const totalAlertas = S.alertas.ajustes.length + S.alertas.atrasados.length + S.alertas.novas.length;
  $('#side-list').innerHTML = `
    <button class="side-item" data-vista="geral" aria-current="${S.vista === 'geral'}"><span class="av">◎</span><span class="t"><b>Visão geral</b><small>${totalAlertas ? totalAlertas + ' pendência' + (totalAlertas > 1 ? 's' : '') : 'Tudo em ordem'}</small></span></button>
    <button class="side-item" data-vista="config" aria-current="${S.vista === 'config'}"><span class="av">⚙</span><span class="t"><b>Configurações</b><small>Indicação, PIX, WhatsApp</small></span></button>
    <div class="side-h">Clientes (${clientes.length})</div>
    ${clientes.map(item).join('') || '<p style="font-size:13px;color:var(--dim);padding:6px 10px">Nenhum cliente ainda.</p>'}
    <div class="side-h">Equipe MLX</div>
    ${equipe.map(item).join('')}
    <button class="side-item" data-equipe><span class="av">+</span><span class="t"><b>Adicionar alguém da equipe</b></span></button>`;
  $$('[data-id]', $('#side-list')).forEach(b => b.onclick = () => abrirCliente(b.dataset.id));
  $$('[data-vista]', $('#side-list')).forEach(b => b.onclick = () => { S.vista = b.dataset.vista; S.sel = null; renderLista(); renderMain(); });
  $('[data-equipe]', $('#side-list')).onclick = () => dialogoNovoUsuario('admin');
}

function renderMain() {
  if (S.vista === 'config') return vistaConfig();
  if (S.vista === 'cliente' && sel()) return vistaCliente();
  return vistaGeral();
}

async function abrirCliente(id, aba) {
  S.vista = 'cliente'; S.sel = id; S.editando = null;
  if (aba) S.aba = aba;
  renderLista();
  $('#main').innerHTML = '<div class="loading"><div><div class="spin"></div>Carregando…</div></div>';
  await carregarCliente();
  vistaCliente();
  if (innerWidth < 960) $('#main').scrollIntoView({ behavior: 'smooth' });
}

async function carregarCliente() {
  const id = S.sel;
  const [posts, pags, inds] = await Promise.all([
    sb.from('postagens').select('*').eq('cliente_id', id).order('data_publicacao', { ascending: false }),
    sb.from('pagamentos').select('*').eq('cliente_id', id).order('vencimento', { ascending: false }),
    sb.from('indicacoes').select('*').eq('cliente_id', id).order('criado_em', { ascending: false })
  ]);
  const erro = [posts, pags, inds].find(r => r.error);
  if (erro) toast(erroAmigavel(erro.error), true);
  S.dados = { posts: posts.data || [], pags: pags.data || [], inds: inds.data || [] };
  S.url = await urlsAssinadas(S.dados.posts.flatMap(p => p.midias || []));
}

/* ---------- Visão geral ---------- */
function vistaGeral() {
  const A = S.alertas, nClientes = S.perfis.filter(p => p.papel === 'cliente').length;
  const bloco = (titulo, itens, fn, vazio) => `<div class="panel"><h3>${titulo} <span class="count">${itens.length}</span></h3>
    ${itens.length ? itens.slice(0, 12).map(fn).join('') : `<p style="color:var(--dim);font-size:13px">${vazio}</p>`}</div>`;
  $('#main').innerHTML = `
    <div class="main-head"><div><h1>Visão geral</h1><p>${nClientes} cliente${nClientes === 1 ? '' : 's'} · ${A.aguardando.length} postage${A.aguardando.length === 1 ? 'm' : 'ns'} esperando aprovação dos clientes</p></div></div>
    ${nClientes ? '' : `<div class="empty-state" style="margin-bottom:18px"><b>Comece cadastrando o primeiro cliente</b>Clique em "Novo cliente" na lateral. Ele recebe e-mail e senha para entrar em mlxmind.com.br/cliente.</div>`}
    <div class="pend">
      ${bloco('Ajustes pedidos', A.ajustes, p => `<button class="pend-item" data-abrir="${p.cliente_id}" data-aba="postagens"><b>${esc(p.titulo)}</b><small>${esc(nomeDe(p.cliente_id))} · ${dataBR(p.data_publicacao)}</small>${p.comentario_cliente ? `<small style="color:#fde68a">“${esc(p.comentario_cliente)}”</small>` : ''}</button>`, 'Nenhum ajuste pendente.')}
      ${bloco('Pagamentos atrasados', A.atrasados, p => `<button class="pend-item" data-abrir="${p.cliente_id}" data-aba="pagamentos"><b>${esc(nomeDe(p.cliente_id))} · ${dinheiro(p.valor)}</b><small>${esc(p.descricao)} · venceu ${dataBR(p.vencimento)}</small></button>`, 'Nenhum pagamento atrasado.')}
      ${bloco('Indicações novas', A.novas, i => `<button class="pend-item" data-abrir="${i.cliente_id}" data-aba="indicacoes"><b>${esc(i.nome_indicado)}</b><small>Indicado por ${esc(nomeDe(i.cliente_id))}${i.contato ? ' · ' + esc(i.contato) : ''}</small></button>`, 'Nenhuma indicação nova.')}
    </div>`;
  $$('[data-abrir]', $('#main')).forEach(b => b.onclick = () => abrirCliente(b.dataset.abrir, b.dataset.aba));
}

/* ---------- Configurações ---------- */
function vistaConfig() {
  const c = S.config;
  $('#main').innerHTML = `
    <div class="main-head"><div><h1>Configurações</h1><p>Valem para todos os clientes.</p></div></div>
    <form class="panel" id="f-config">
      <h3>Programa de indicação</h3>
      <div class="field"><label for="c-desc">Desconto oferecido (aparece em destaque para o cliente)</label><textarea id="c-desc" maxlength="300">${esc(c.desconto_indicacao)}</textarea></div>
      <div class="field"><label for="c-regras">Regras / como funciona</label><textarea id="c-regras" maxlength="800">${esc(c.regras_indicacao)}</textarea></div>
      <h3 style="margin-top:10px">Pagamentos e contato</h3>
      <div class="grid-2">
        <div class="field"><label for="c-pix">Chave PIX da MLX</label><input id="c-pix" maxlength="140" value="${esc(c.chave_pix || '')}" placeholder="CNPJ, e-mail, telefone ou chave aleatória"><small>Aparece na aba de pagamentos do cliente, com botão de copiar.</small></div>
        <div class="field"><label for="c-wa">WhatsApp da MLX</label><input id="c-wa" maxlength="16" inputmode="numeric" value="${esc(c.whatsapp || '')}" placeholder="5516991234567"><small>Só números, com 55 + DDD. Vira o botão "Falar com a MLX".</small></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar configurações</button></div>
    </form>`;
  $('#f-config').onsubmit = async e => {
    e.preventDefault();
    const wa = $('#c-wa').value.replace(/\D/g, '');
    if (wa && !/^\d{12,13}$/.test(wa)) return toast('WhatsApp inválido. Use 55 + DDD + número.', true);
    const upd = { desconto_indicacao: $('#c-desc').value.trim(), regras_indicacao: $('#c-regras').value.trim(), chave_pix: $('#c-pix').value.trim() || null, whatsapp: wa || null, atualizado_em: new Date().toISOString() };
    const { error } = await sb.from('configuracoes').update(upd).eq('id', 1);
    if (error) return toast(erroAmigavel(error), true);
    Object.assign(S.config, upd);
    toast('Configurações salvas.');
  };
}

/* ---------- Cliente ---------- */
function vistaCliente() {
  const c = sel(), D = S.dados;
  const abertos = D.pags.filter(p => p.status === 'pendente');
  const ajustes = D.posts.filter(p => p.status === 'ajuste_solicitado').length;
  $('#main').innerHTML = `
    <div class="main-head">
      <div><h1>${esc(c.nome || c.email)}</h1>
        <p>${esc([c.empresa, c.email, c.telefone].filter(Boolean).join(' · '))}${c.papel === 'admin' ? ' · <b>Equipe MLX</b>' : ''}${c.ativo ? '' : ' · <span style="color:var(--bad)">acesso suspenso</span>'}</p></div>
      ${c.papel === 'cliente' ? `<div class="code-box" style="margin:0;padding:8px 14px"><span style="font-size:12px;color:var(--dim)">Código de indicação</span><code style="font-size:18px">${esc(c.codigo_indicacao)}</code></div>` : ''}
    </div>
    <div class="tabs" role="tablist">
      ${[['postagens', 'Postagens', ajustes], ['pagamentos', 'Pagamentos', abertos.length], ['indicacoes', 'Indicações', D.inds.filter(i => i.status === 'nova').length], ['dados', 'Dados e acesso', 0]]
        .map(([k, t, n]) => `<button class="tab" role="tab" data-aba="${k}" aria-selected="${S.aba === k}">${t}${n ? ` <span class="count">${n}</span>` : ''}</button>`).join('')}
    </div>
    <div id="aba"></div>`;
  $$('.tab', $('#main')).forEach(t => t.onclick = () => { S.aba = t.dataset.aba; S.editando = null; vistaCliente(); });
  ({ postagens: abaPostagens, pagamentos: abaPagamentos, indicacoes: abaIndicacoes, dados: abaDados })[S.aba]();
}

/* ----- Postagens ----- */
function abaPostagens() {
  const el = $('#aba'), D = S.dados, ed = S.editando ? D.posts.find(p => p.id === S.editando) : null;
  const opt = (lista, v) => lista.map(x => `<option${x === v ? ' selected' : ''}>${x}</option>`).join('');
  const optStatus = v => Object.entries(STATUS_POST).map(([k, [t]]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('');
  const mantidas = ed ? [...(ed.midias || [])] : [];

  el.innerHTML = `
    <form class="panel" id="f-post">
      <div class="panel-h"><h3>${ed ? 'Editar postagem' : 'Nova postagem'}</h3>${ed ? '<button class="btn btn-sm btn-ghost" type="button" id="cancelar-ed">Cancelar edição</button>' : ''}</div>
      <div class="grid-2">
        <div class="field full"><label for="p-tit">Título</label><input id="p-tit" required maxlength="140" value="${esc(ed?.titulo || '')}" placeholder="Ex.: Promoção de terça"></div>
        <div class="field"><label for="p-data">Data de publicação</label><input id="p-data" type="date" required value="${esc(ed?.data_publicacao || isoData(hoje()))}"></div>
        <div class="field"><label for="p-status">Status</label><select id="p-status">${optStatus(ed?.status || 'aguardando_aprovacao')}</select></div>
        <div class="field"><label for="p-fmt">Formato</label><select id="p-fmt">${opt(FORMATOS, ed?.formato || 'Post')}</select></div>
        <div class="field"><label for="p-rede">Rede</label><select id="p-rede">${opt(REDES, ed?.rede || 'Instagram')}</select></div>
        <div class="field full"><label for="p-leg">Legenda</label><textarea id="p-leg" maxlength="5000">${esc(ed?.legenda || '')}</textarea></div>
        <div class="field full"><label for="p-arq">Fotos e vídeos</label>
          <div class="thumbs" id="thumbs"></div>
          <input id="p-arq" type="file" accept="image/*,video/*" multiple>
          <small>Pode escolher vários arquivos (vira carrossel). Limite de 50 MB por arquivo no plano grátis do Supabase. "Rascunho" fica escondido do cliente.</small></div>
      </div>
      <div class="progress" id="prog" hidden><i></i></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${ed ? 'Salvar alterações' : 'Publicar para o cliente'}</button></div>
    </form>
    <h3 class="section-h">Postagens (${D.posts.length})</h3>
    ${D.posts.length ? `<div class="list">${D.posts.map(linhaPost).join('')}</div>` : '<div class="empty-state"><b>Nenhuma postagem ainda</b>Use o formulário acima para subir a primeira.</div>'}`;

  // pré-visualização: mídias já salvas + novas
  let novos = [];
  const desenharThumbs = () => {
    $('#thumbs').innerHTML =
      mantidas.map((p, i) => `<div class="thumb">${ehVideo(p) ? `<video src="${esc(S.url(p))}" muted></video><span class="tag">vídeo</span>` : `<img src="${esc(S.url(p))}" alt="">`}<button type="button" data-rm-old="${i}" aria-label="Remover">×</button></div>`).join('') +
      novos.map((f, i) => `<div class="thumb">${f.type.startsWith('video') ? `<video src="${f._url}" muted></video><span class="tag">vídeo</span>` : `<img src="${f._url}" alt="">`}<button type="button" data-rm-new="${i}" aria-label="Remover">×</button></div>`).join('');
    $$('[data-rm-old]', el).forEach(b => b.onclick = () => { mantidas.splice(+b.dataset.rmOld, 1); desenharThumbs(); });
    $$('[data-rm-new]', el).forEach(b => b.onclick = () => { novos.splice(+b.dataset.rmNew, 1); desenharThumbs(); });
  };
  $('#p-arq').onchange = e => {
    novos.push(...[...e.target.files].map(f => Object.assign(f, { _url: URL.createObjectURL(f) })));
    e.target.value = '';
    desenharThumbs();
  };
  desenharThumbs();
  $('#cancelar-ed')?.addEventListener('click', () => { S.editando = null; abaPostagens(); });

  $('#f-post').onsubmit = async e => {
    e.preventDefault();
    const titulo = $('#p-tit').value.trim(), data = $('#p-data').value;
    if (!titulo || !data) return toast('Preencha título e data.', true);
    const grande = novos.find(f => f.size > 50 * 1024 * 1024);
    if (grande) return toast(`"${grande.name}" passa de 50 MB. Comprima o arquivo antes de enviar.`, true);
    const btn = e.submitter; btn.disabled = true;
    const prog = $('#prog'), barra = $('#prog i'); prog.hidden = !novos.length;
    try {
      const enviados = [];
      for (const [i, f] of novos.entries()) {
        const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${S.sel}/${crypto.randomUUID()}.${ext}`;
        btn.textContent = `Enviando ${i + 1} de ${novos.length}…`;
        const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
        if (error) throw error;
        enviados.push(path);
        barra.style.width = `${((i + 1) / novos.length) * 100}%`;
      }
      const registro = {
        cliente_id: S.sel, titulo, data_publicacao: data,
        status: $('#p-status').value, formato: $('#p-fmt').value, rede: $('#p-rede').value,
        legenda: $('#p-leg').value.trim() || null, midias: [...mantidas, ...enviados]
      };
      if (ed) {
        const { error } = await sb.from('postagens').update(registro).eq('id', ed.id);
        if (error) throw error;
        const removidas = (ed.midias || []).filter(p => !mantidas.includes(p));
        if (removidas.length) await sb.storage.from(BUCKET).remove(removidas);
      } else {
        const { error } = await sb.from('postagens').insert(registro);
        if (error) throw error;
      }
      toast(ed ? 'Postagem atualizada.' : 'Postagem publicada para o cliente.');
      S.editando = null;
      await carregarCliente(); await recarregarBase();
      renderLista(); vistaCliente();
    } catch (err) {
      toast(erroAmigavel(err), true);
      btn.disabled = false; btn.textContent = ed ? 'Salvar alterações' : 'Publicar para o cliente';
    }
  };

  $$('[data-st-post]', el).forEach(s => s.onchange = async () => {
    const { error } = await sb.from('postagens').update({ status: s.value }).eq('id', s.dataset.stPost);
    if (error) return toast(erroAmigavel(error), true);
    D.posts.find(p => p.id === s.dataset.stPost).status = s.value;
    toast('Status atualizado.'); await recarregarBase(); renderLista();
  });
  $$('[data-ed-post]', el).forEach(b => b.onclick = () => { S.editando = b.dataset.edPost; abaPostagens(); $('#f-post').scrollIntoView({ behavior: 'smooth' }); });
  $$('[data-del-post]', el).forEach(b => b.onclick = async () => {
    const p = D.posts.find(x => x.id === b.dataset.delPost);
    if (!confirm(`Excluir a postagem "${p.titulo}"? As fotos e vídeos dela também serão apagados.`)) return;
    const { error } = await sb.from('postagens').delete().eq('id', p.id);
    if (error) return toast(erroAmigavel(error), true);
    if (p.midias?.length) await sb.storage.from(BUCKET).remove(p.midias);
    D.posts = D.posts.filter(x => x.id !== p.id);
    toast('Postagem excluída.'); await recarregarBase(); renderLista(); vistaCliente();
  });
}

function linhaPost(p) {
  const m = p.midias?.[0];
  const mini = m ? (ehVideo(m) ? `<video src="${esc(S.url(m))}" muted preload="metadata"></video>` : `<img src="${esc(S.url(m))}" alt="" loading="lazy">`) : 'sem mídia';
  const opts = Object.entries(STATUS_POST).map(([k, [t]]) => `<option value="${k}"${k === p.status ? ' selected' : ''}>${t}</option>`).join('');
  return `<div class="arow">
    <div class="mini">${mini}</div>
    <div><h4>${esc(p.titulo)}</h4>
      <div class="sub">${esc(diaSemana(p.data_publicacao))} · ${esc(p.formato)} · ${esc(p.rede)}${p.midias?.length > 1 ? ` · ${p.midias.length} arquivos` : ''}</div>
      ${p.comentario_cliente && p.status === 'ajuste_solicitado' ? `<div class="note" style="margin-top:8px"><b>Cliente pediu:</b> ${esc(p.comentario_cliente)}</div>` : ''}
    </div>
    <div class="acts">
      <select class="sel-sm" data-st-post="${p.id}" aria-label="Status">${opts}</select>
      <button class="btn btn-sm" data-ed-post="${p.id}">Editar</button>
      <button class="btn btn-sm btn-danger" data-del-post="${p.id}" aria-label="Excluir">Excluir</button>
    </div></div>`;
}

/* ----- Pagamentos ----- */
function abaPagamentos() {
  const el = $('#aba'), D = S.dados, ed = S.editando ? D.pags.find(p => p.id === S.editando) : null;
  const abertos = D.pags.filter(p => p.status === 'pendente').sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const outros = D.pags.filter(p => p.status !== 'pendente');
  el.innerHTML = `
    <form class="panel" id="f-pag">
      <div class="panel-h"><h3>${ed ? 'Editar pagamento' : 'Novo pagamento'}</h3>${ed ? '<button class="btn btn-sm btn-ghost" type="button" id="cancelar-ed">Cancelar edição</button>' : ''}</div>
      <div class="grid-3">
        <div class="field"><label for="g-desc">Descrição</label><input id="g-desc" required maxlength="140" value="${esc(ed?.descricao || 'Mensalidade')}"></div>
        <div class="field"><label for="g-val">Valor (R$)</label><input id="g-val" required inputmode="decimal" value="${ed ? String(ed.valor).replace('.', ',') : ''}" placeholder="1.500,00"></div>
        <div class="field"><label for="g-venc">Vencimento</label><input id="g-venc" type="date" required value="${esc(ed?.vencimento || '')}"></div>
        <div class="field"><label for="g-link">Link de pagamento (opcional)</label><input id="g-link" type="url" maxlength="500" value="${esc(ed?.link_pagamento || '')}" placeholder="https://…"></div>
        <div class="field"><label for="g-obs">Observação (opcional)</label><input id="g-obs" maxlength="200" value="${esc(ed?.observacao || '')}"></div>
        ${ed ? `<div class="field"><label for="g-st">Status</label><select id="g-st">
            <option value="pendente"${ed.status === 'pendente' ? ' selected' : ''}>Em aberto</option>
            <option value="pago"${ed.status === 'pago' ? ' selected' : ''}>Pago</option>
            <option value="cancelado"${ed.status === 'cancelado' ? ' selected' : ''}>Cancelado (cliente não vê)</option></select></div>`
          : `<div class="field"><label for="g-rep">Repetir todo mês</label><select id="g-rep">${[1, 2, 3, 4, 6, 12].map(n => `<option value="${n}">${n === 1 ? 'Não repetir' : n + ' meses'}</option>`).join('')}</select></div>`}
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${ed ? 'Salvar' : 'Lançar pagamento'}</button></div>
    </form>
    <h3 class="section-h">Em aberto</h3>
    ${abertos.length ? `<div class="list">${abertos.map(linhaPag).join('')}</div>` : '<p style="color:var(--dim);font-size:14px">Nada em aberto.</p>'}
    ${outros.length ? `<h3 class="section-h">Pagos e cancelados</h3><div class="list">${outros.map(linhaPag).join('')}</div>` : ''}`;

  $('#cancelar-ed')?.addEventListener('click', () => { S.editando = null; abaPagamentos(); });
  $('#f-pag').onsubmit = async e => {
    e.preventDefault();
    const valor = parseValor($('#g-val').value);
    const venc = $('#g-venc').value, desc = $('#g-desc').value.trim(), link = $('#g-link').value.trim();
    if (!desc || !venc || !(valor >= 0)) return toast('Preencha descrição, valor e vencimento.', true);
    if (link && !/^https?:\/\//i.test(link)) return toast('O link precisa começar com https://', true);
    const base = { cliente_id: S.sel, descricao: desc, valor, link_pagamento: link || null, observacao: $('#g-obs').value.trim() || null };
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
    toast(ed ? 'Pagamento atualizado.' : 'Pagamento lançado.');
    S.editando = null; await carregarCliente(); await recarregarBase(); renderLista(); vistaCliente();
  };
  $$('[data-pago]', el).forEach(b => b.onclick = async () => {
    const pago = b.dataset.acao === 'pagar';
    const { error } = await sb.from('pagamentos').update({ status: pago ? 'pago' : 'pendente', pago_em: pago ? isoData(hoje()) : null }).eq('id', b.dataset.pago);
    if (error) return toast(erroAmigavel(error), true);
    toast(pago ? 'Marcado como pago.' : 'Pagamento reaberto.');
    await carregarCliente(); await recarregarBase(); renderLista(); vistaCliente();
  });
  $$('[data-ed-pag]', el).forEach(b => b.onclick = () => { S.editando = b.dataset.edPag; abaPagamentos(); $('#f-pag').scrollIntoView({ behavior: 'smooth' }); });
  $$('[data-del-pag]', el).forEach(b => b.onclick = async () => {
    if (!confirm('Excluir esse pagamento?')) return;
    const { error } = await sb.from('pagamentos').delete().eq('id', b.dataset.delPag);
    if (error) return toast(erroAmigavel(error), true);
    toast('Pagamento excluído.'); await carregarCliente(); await recarregarBase(); renderLista(); vistaCliente();
  });
}

function linhaPag(p) {
  return `<div class="row">
    <div><h4>${esc(p.descricao)} · ${dinheiro(p.valor)}</h4>
      <div class="sub">Vence ${dataBR(p.vencimento)}${p.pago_em ? ` · pago em ${dataBR(p.pago_em)}` : ''}${p.observacao ? ` · ${esc(p.observacao)}` : ''}${p.link_pagamento ? ' · com link' : ''}</div></div>
    <div class="right">${badge(statusPagamento(p))}
      ${p.status === 'pendente' ? `<button class="btn btn-sm btn-ok" data-pago="${p.id}" data-acao="pagar">Marcar pago</button>` : p.status === 'pago' ? `<button class="btn btn-sm btn-ghost" data-pago="${p.id}" data-acao="reabrir">Reabrir</button>` : ''}
      <button class="btn btn-sm" data-ed-pag="${p.id}">Editar</button>
      <button class="btn btn-sm btn-danger" data-del-pag="${p.id}">Excluir</button></div>
  </div>`;
}

/* ----- Indicações ----- */
function abaIndicacoes() {
  const el = $('#aba'), D = S.dados;
  const ganho = D.inds.filter(i => i.status === 'fechou').reduce((s, i) => s + Number(i.desconto_valor || 0), 0);
  const aAplicar = D.inds.filter(i => i.status === 'fechou' && !i.desconto_aplicado && Number(i.desconto_valor) > 0).reduce((s, i) => s + Number(i.desconto_valor), 0);
  el.innerHTML = `
    <div class="tiles">
      <div class="tile"><span class="lbl">Indicações</span><strong>${D.inds.length}</strong></div>
      <div class="tile"><span class="lbl">Desconto total</span><strong>${dinheiro(ganho)}</strong></div>
      <div class="tile accent"><span class="lbl">Falta aplicar</span><strong>${dinheiro(aAplicar)}</strong><small>Desconte na próxima mensalidade e marque "aplicado".</small></div>
    </div>
    <form class="panel" id="f-ind">
      <h3>Registrar indicação</h3>
      <div class="grid-3">
        <div class="field"><label for="n-nome">Nome indicado</label><input id="n-nome" required maxlength="120"></div>
        <div class="field"><label for="n-cont">Contato</label><input id="n-cont" maxlength="120"></div>
        <div class="field"><label for="n-obs">Observação</label><input id="n-obs" maxlength="500"></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Adicionar</button></div>
    </form>
    ${D.inds.length ? `<div class="list">${D.inds.map(i => `
      <div class="row" data-ind="${i.id}">
        <div><h4>${esc(i.nome_indicado)}</h4><div class="sub">${esc(i.contato || 'sem contato')} · ${dataBR(i.criado_em.slice(0, 10))}${i.observacao ? `<br>${esc(i.observacao)}` : ''}</div></div>
        <div class="right">
          <select class="sel-sm" data-k="status" aria-label="Status">${Object.entries(STATUS_IND).map(([k, [t]]) => `<option value="${k}"${k === i.status ? ' selected' : ''}>${t}</option>`).join('')}</select>
          <input class="inp" data-k="desconto_valor" style="width:110px;padding:7px 10px;border-radius:100px;font-size:12px" inputmode="decimal" aria-label="Desconto em reais" placeholder="Desconto R$" value="${Number(i.desconto_valor) ? String(i.desconto_valor).replace('.', ',') : ''}">
          <label class="check"><input type="checkbox" data-k="desconto_aplicado"${i.desconto_aplicado ? ' checked' : ''}>aplicado</label>
          <button class="btn btn-sm" data-salvar>Salvar</button>
          <button class="btn btn-sm btn-danger" data-del>Excluir</button>
        </div>
      </div>`).join('')}</div>` : '<div class="empty-state"><b>Nenhuma indicação</b>Quando o cliente indicar alguém pela área dele, aparece aqui.</div>'}`;

  $('#f-ind').onsubmit = async e => {
    e.preventDefault();
    const nome = $('#n-nome').value.trim();
    if (nome.length < 2) return toast('Informe o nome.', true);
    const { error } = await sb.from('indicacoes').insert({ cliente_id: S.sel, nome_indicado: nome, contato: $('#n-cont').value.trim() || null, observacao: $('#n-obs').value.trim() || null });
    if (error) return toast(erroAmigavel(error), true);
    toast('Indicação registrada.'); await carregarCliente(); await recarregarBase(); renderLista(); vistaCliente();
  };
  $$('[data-ind]', el).forEach(r => {
    const id = r.dataset.ind;
    $('[data-salvar]', r).onclick = async () => {
      const v = parseValor($('[data-k=desconto_valor]', r).value || '0');
      if (!(v >= 0)) return toast('Desconto inválido.', true);
      const { error } = await sb.from('indicacoes').update({ status: $('[data-k=status]', r).value, desconto_valor: v, desconto_aplicado: $('[data-k=desconto_aplicado]', r).checked }).eq('id', id);
      if (error) return toast(erroAmigavel(error), true);
      toast('Indicação atualizada.'); await carregarCliente(); await recarregarBase(); renderLista(); vistaCliente();
    };
    $('[data-del]', r).onclick = async () => {
      if (!confirm('Excluir essa indicação?')) return;
      const { error } = await sb.from('indicacoes').delete().eq('id', id);
      if (error) return toast(erroAmigavel(error), true);
      toast('Indicação excluída.'); await carregarCliente(); await recarregarBase(); renderLista(); vistaCliente();
    };
  });
}

/* ----- Dados e acesso ----- */
function abaDados() {
  const el = $('#aba'), c = sel(), souEu = c.id === S.eu.id;
  el.innerHTML = `
    <form class="panel" id="f-dados">
      <h3>Dados</h3>
      <div class="grid-3">
        <div class="field"><label for="d-nome">Nome</label><input id="d-nome" required maxlength="120" value="${esc(c.nome)}"></div>
        <div class="field"><label for="d-emp">Empresa</label><input id="d-emp" maxlength="120" value="${esc(c.empresa || '')}"></div>
        <div class="field"><label for="d-tel">Telefone</label><input id="d-tel" maxlength="30" value="${esc(c.telefone || '')}"></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar dados</button></div>
    </form>
    <div class="panel">
      <h3>Acesso</h3>
      <div class="grid-2">
        <form class="field" id="f-email"><label for="d-email">E-mail de login</label><input id="d-email" type="email" required value="${esc(c.email || '')}"><div class="form-actions"><button class="btn btn-sm" type="submit">Alterar e-mail</button></div></form>
        <form class="field" id="f-senha"><label for="d-senha">Nova senha</label><input id="d-senha" type="text" minlength="8" autocomplete="off" placeholder="Mínimo 8 caracteres"><div class="form-actions"><button class="btn btn-sm" type="submit">Definir senha</button><button class="btn btn-sm btn-ghost" type="button" id="gerar">Gerar senha</button></div></form>
      </div>
      <p style="color:var(--dim);font-size:13px;line-height:1.6">Depois de definir a senha, envie para o cliente junto com o link <b>mlxmind.com.br/cliente</b>. Ele também pode usar "Esqueci minha senha" na tela de login.</p>
    </div>
    ${souEu ? '' : `<div class="panel">
      <h3>Zona de cuidado</h3>
      <div class="form-actions">
        <button class="btn" id="b-ativo">${c.ativo ? 'Suspender acesso' : 'Reativar acesso'}</button>
        <button class="btn" id="b-papel">${c.papel === 'admin' ? 'Tirar da equipe (virar cliente)' : 'Tornar membro da equipe MLX'}</button>
        <button class="btn btn-danger" id="b-excluir">Excluir ${c.papel === 'admin' ? 'login' : 'cliente'} e todos os dados</button>
      </div></div>`}`;

  const depois = async msg => { toast(msg); await recarregarBase(); renderLista(); vistaCliente(); };
  $('#f-dados').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.from('perfis').update({ nome: $('#d-nome').value.trim(), empresa: $('#d-emp').value.trim() || null, telefone: $('#d-tel').value.trim() || null }).eq('id', c.id);
    if (error) return toast(erroAmigavel(error), true);
    depois('Dados salvos.');
  };
  $('#f-email').onsubmit = async e => {
    e.preventDefault();
    try { await chamarFuncao({ acao: 'alterar_email', id: c.id, email: $('#d-email').value.trim() }); depois('E-mail alterado.'); }
    catch (err) { toast(erroAmigavel(err), true); }
  };
  $('#gerar').onclick = () => { $('#d-senha').value = gerarSenha(); };
  $('#f-senha').onsubmit = async e => {
    e.preventDefault();
    const senha = $('#d-senha').value;
    if (senha.length < 8) return toast('A senha precisa ter pelo menos 8 caracteres.', true);
    try { await chamarFuncao({ acao: 'redefinir_senha', id: c.id, senha }); mostrarAcesso(c.nome, c.email, senha); }
    catch (err) { toast(erroAmigavel(err), true); }
  };
  $('#b-ativo')?.addEventListener('click', async () => {
    if (c.ativo && !confirm(`Suspender o acesso de ${c.nome}? Ele não vai conseguir entrar até você reativar.`)) return;
    try { await chamarFuncao({ acao: 'ativar', id: c.id, ativo: !c.ativo }); depois(c.ativo ? 'Acesso suspenso.' : 'Acesso reativado.'); }
    catch (err) { toast(erroAmigavel(err), true); }
  });
  $('#b-papel')?.addEventListener('click', async () => {
    const novo = c.papel === 'admin' ? 'cliente' : 'admin';
    if (!confirm(novo === 'admin' ? `${c.nome} vai ter acesso total ao painel admin. Confirmar?` : `${c.nome} vai perder o acesso ao painel admin. Confirmar?`)) return;
    const { error } = await sb.from('perfis').update({ papel: novo }).eq('id', c.id);
    if (error) return toast(erroAmigavel(error), true);
    depois('Permissão atualizada.');
  });
  $('#b-excluir')?.addEventListener('click', async () => {
    const t = prompt(`Isso apaga o login de ${c.nome}, todas as postagens, fotos, pagamentos e indicações. Não dá para desfazer.\n\nDigite EXCLUIR para confirmar:`);
    if (t !== 'EXCLUIR') return;
    try {
      await chamarFuncao({ acao: 'excluir', id: c.id });
      S.vista = 'geral'; S.sel = null;
      await recarregarBase(); render(); toast('Excluído.');
    } catch (err) { toast(erroAmigavel(err), true); }
  });
}

// "1.500,00" / "1500,5" / "1500.50" → número (NaN se vazio/inválido)
function parseValor(txt) {
  let t = String(txt || '').trim().replace(/[^\d,.-]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return Number(t);
}

/* ---------- novo cliente / equipe ---------- */
function gerarSenha() {
  const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const a = crypto.getRandomValues(new Uint32Array(10));
  return 'Mlx-' + [...a].map(n => c[n % c.length]).join('');
}

function dialogoNovoUsuario(papel) {
  const equipe = papel === 'admin';
  dlg.innerHTML = `
    <button class="x" aria-label="Fechar" data-fechar>×</button>
    <h2>${equipe ? 'Adicionar alguém da equipe' : 'Novo cliente'}</h2>
    <p class="dsub">${equipe ? 'Essa pessoa terá acesso total ao painel admin.' : 'O cliente entra em mlxmind.com.br/cliente com esse e-mail e senha.'}</p>
    <form id="f-novo" novalidate>
      <div class="grid-2">
        <div class="field full"><label for="u-nome">Nome</label><input id="u-nome" required maxlength="120"></div>
        ${equipe ? '' : '<div class="field"><label for="u-emp">Empresa</label><input id="u-emp" maxlength="120"></div><div class="field"><label for="u-tel">Telefone</label><input id="u-tel" maxlength="30"></div>'}
        <div class="field full"><label for="u-email">E-mail de login</label><input id="u-email" type="email" required autocomplete="off"></div>
        <div class="field full"><label for="u-senha">Senha inicial</label><input id="u-senha" type="text" required minlength="8" autocomplete="off" value="${gerarSenha()}"><small>Já geramos uma senha forte. Você pode trocar se quiser.</small></div>
      </div>
      <div id="u-msg" class="form-msg err" hidden></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">${equipe ? 'Adicionar à equipe' : 'Criar cliente'}</button><button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div>
    </form>`;
  dlg.showModal();
  $$('[data-fechar]', dlg).forEach(b => b.onclick = () => dlg.close());
  $('#f-novo').onsubmit = async e => {
    e.preventDefault();
    const m = $('#u-msg'), btn = e.submitter;
    const body = { acao: 'criar', papel, nome: $('#u-nome').value.trim(), email: $('#u-email').value.trim(), senha: $('#u-senha').value, empresa: $('#u-emp')?.value.trim(), telefone: $('#u-tel')?.value.trim() };
    if (!body.nome || !body.email) { m.textContent = 'Preencha nome e e-mail.'; m.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Criando…'; m.hidden = true;
    try {
      const r = await chamarFuncao(body);
      await recarregarBase();
      S.vista = 'cliente'; S.sel = r.id; S.aba = equipe ? 'dados' : 'postagens';
      render(); await abrirCliente(r.id);
      mostrarAcesso(body.nome, body.email, body.senha);
    } catch (err) {
      m.textContent = erroAmigavel(err); m.hidden = false;
      btn.disabled = false; btn.textContent = equipe ? 'Adicionar à equipe' : 'Criar cliente';
    }
  };
}

function mostrarAcesso(nome, email, senha) {
  const txt = `Olá, ${nome.split(' ')[0]}! Sua área do cliente da MLX Mind está pronta.\n\nAcesse: https://mlxmind.com.br/cliente\nE-mail: ${email}\nSenha: ${senha}\n\nLá você vê as postagens da semana, aprova os conteúdos, acompanha pagamentos e indica amigos com desconto.`;
  dlg.innerHTML = `
    <button class="x" aria-label="Fechar" data-fechar>×</button>
    <h2>Acesso pronto ✔</h2>
    <p class="dsub">Envie esses dados para ${esc(nome)}. A senha não fica visível depois.</p>
    <textarea class="inp inp-area" style="min-height:190px" readonly id="acesso-txt">${esc(txt)}</textarea>
    <div class="form-actions" style="margin-top:14px">
      <button class="btn btn-primary" id="cp-acesso">${ICON.copy}Copiar mensagem</button>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(txt)}">${ICON.wa}Enviar no WhatsApp</a>
      <button class="btn btn-ghost" data-fechar>Fechar</button>
    </div>`;
  if (!dlg.open) dlg.showModal();
  $$('[data-fechar]', dlg).forEach(b => b.onclick = () => dlg.close());
  $('#cp-acesso').onclick = () => copiar(txt);
}
