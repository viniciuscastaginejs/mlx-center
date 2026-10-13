/* =========================================================
   MLX Mind · Área do cliente (v2)
   ========================================================= */
import {
  sb, $, $$, esc, dinheiro, parseData, isoData, hoje, addDias, inicioSemana, dataBR, diaSemana,
  STATUS_POST, STATUS_IND, statusPagamento, badge, urlsAssinadas, toast, erroAmigavel, copiar,
  montarLogin, montarNovaSenha, LOGO, ICON, ICON2, mesISO, addMeses, mesNome, cap, num, bytes,
  STATUS_SOL, STATUS_MAT, urlsDe, baixar, comprimirImagem, nomeSeguro, LIMITE_ARQUIVO, abrirModal, ehVideo
} from './comum.js';
import { cardPost, ligarLegendas, calendarioMes, vistaResultados, blocoMeta, blocoAcessos, listaAtividades, resumoLeads, linhaLead } from './blocos.js';

const app = $('#app'), topUser = $('#top-user'), dlg = $('#dlg');
$('#logo').outerHTML = LOGO;

const S = {
  uid: null, eu: null, conta: null, membros: [], config: {}, posts: [], pags: [], inds: [], metricas: [], metas: [],
  rels: [], leads: [], mats: [], sols: [], docs: [], acs: [], ativ: [], url: () => '', urlMat: () => '',
  secao: 'inicio', modoPlan: 'semana', semana: inicioSemana(hoje()), mesPlan: mesISO(), mesRes: null, mesLeads: mesISO()
};
let recuperando = false;
const completo = () => S.eu?.permissao === 'completo';

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
    montarLogin(app, { eyebrow: 'Área do cliente', titulo: 'Entre na sua área', subtitulo: 'Planejamento, resultados, relatórios, pagamentos e tudo o que a MLX faz por você.' });
    return;
  }
  app.innerHTML = '<div class="loading"><div><div class="spin"></div>Carregando sua área…</div></div>';
  try {
    const { data: eu, error } = await sb.from('perfis').select('*').eq('id', session.user.id).single();
    if (error) throw error;
    S.eu = eu;
    if (eu.papel === 'admin') {
      montarTopo();
      app.innerHTML = `<section class="login"><div class="login-card"><span class="eyebrow">Equipe MLX</span><h1>Você entrou com um login da equipe</h1>
        <p>Para ver a área como um cliente vê, abra o cliente no painel admin e use "Ver como cliente".</p><a class="btn btn-primary" href="/admin/">Ir para o painel admin</a></div></section>`;
      return;
    }
    if (!eu.conta_id || !eu.ativo) {
      montarTopo();
      app.innerHTML = `<section class="login"><div class="login-card"><span class="eyebrow">Acesso</span><h1>Seu acesso não está ativo</h1><p>Fale com a MLX para liberar sua área.</p></div></section>`;
      return;
    }
    await carregar();
    montarTopo();
    render();
  } catch (e) {
    app.innerHTML = `<div class="loading"><div style="text-align:center">Não foi possível carregar sua área.<br><small>${esc(erroAmigavel(e))}</small><br><br><button class="btn" id="tentar">Tentar de novo</button></div></div>`;
    $('#tentar').onclick = iniciar;
  }
}

async function carregar() {
  const c = S.eu.conta_id, vazio = Promise.resolve({ data: [] });
  const q = (t, o = 'criado_em', asc = false) => sb.from(t).select('*').eq('conta_id', c).order(o, { ascending: asc });
  const r = await Promise.all([
    sb.from('contas').select('*').eq('id', c).single(),
    sb.from('perfis').select('id,nome,email,permissao,ativo').eq('conta_id', c).order('nome'),
    sb.from('configuracoes').select('*').eq('id', 1).single(),
    q('postagens', 'data_publicacao', true),
    completo() ? q('pagamentos', 'vencimento', true) : vazio,
    q('indicacoes'),
    q('metricas', 'mes'),
    q('metas', 'mes'),
    q('relatorios', 'mes'),
    q('leads', 'data'),
    q('materiais'),
    q('solicitacoes'),
    completo() ? q('documentos') : vazio,
    completo() ? q('acessos', 'rede', true) : vazio,
    sb.from('atividades').select('*').eq('conta_id', c).order('criado_em', { ascending: false }).limit(120)
  ]);
  const erro = r.find(x => x.error); if (erro) throw erro.error;
  [S.conta, S.membros, S.config, S.posts, S.pags, S.inds, S.metricas, S.metas, S.rels, S.leads, S.mats, S.sols, S.docs, S.acs, S.ativ] = r.map(x => x.data);
  S.config ||= {};
  S.url = await urlsAssinadas(S.posts.flatMap(p => p.midias || []));
  S.urlMat = await urlsDe('materiais', S.mats.filter(m => (m.tipo_mime || '').startsWith('image/')).map(m => m.path));
  if (!S.mesRes) S.mesRes = S.metricas.length ? S.metricas.map(m => m.mes).sort().at(-1) : mesISO();
}

function montarTopo() {
  topUser.innerHTML = `<span class="who">Olá, <b>${esc((S.eu.nome || '').split(' ')[0] || 'cliente')}</b></span>
    ${S.eu.papel === 'admin' ? '<a class="btn btn-sm" href="/admin/">Painel admin</a>' : ''}
    <button class="btn btn-sm btn-ghost" id="sair">${ICON.out}Sair</button>`;
  topUser.hidden = false;
  $('#sair').onclick = () => sb.auth.signOut();
}

/* ---------- cálculos ---------- */
const pendAprov = () => S.posts.filter(p => p.status === 'aguardando_aprovacao');
const emAberto = () => S.pags.filter(p => p.status === 'pendente').sort((a, b) => a.vencimento.localeCompare(b.vencimento));
const solAbertas = () => S.sols.filter(s => ['aberta', 'em_andamento'].includes(s.status));
function postsEntre(a, b) { return S.posts.filter(p => p.data_publicacao >= a && p.data_publicacao < b); }

/* ---------- menu ---------- */
function secoes() {
  return [
    ['inicio', 'Início', ICON2.home],
    ['planejamento', 'Planejamento', ICON2.cal, pendAprov().length],
    ['resultados', 'Resultados', ICON2.chart],
    S.conta.modulo_leads && ['leads', 'Leads', ICON2.funnel],
    ['relatorios', 'Relatórios', ICON2.report, 0],
    ['solicitacoes', 'Solicitações', ICON2.chat, solAbertas().length],
    ['materiais', 'Enviar material', ICON2.upload],
    completo() && ['pagamentos', 'Pagamentos', ICON2.money, emAberto().filter(p => statusPagamento(p)[1] === 'b-bad').length],
    completo() && ['documentos', 'Documentos', ICON2.doc],
    completo() && ['acessos', 'Acessos das redes', ICON2.key],
    ['indicacoes', 'Indique e ganhe', ICON2.gift],
    ['historico', 'Histórico', ICON2.clock],
    ['conta', 'Minha conta', ICON2.user]
  ].filter(Boolean);
}

function render() {
  const lista = secoes();
  if (!lista.some(s => s[0] === S.secao)) S.secao = 'inicio';
  app.innerHTML = `
  <section class="dash">
    <div class="hello">
      <div><span class="eyebrow">${esc(S.conta.nome)}</span><h1>Olá, ${esc((S.eu.nome || '').split(' ')[0] || 'tudo bem')}!</h1></div>
      ${S.config.whatsapp ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${esc(S.config.whatsapp)}?text=${encodeURIComponent('Oi, MLX! Aqui é ' + (S.eu.nome || '') + ' da ' + S.conta.nome + '.')}">${ICON.wa}Falar com a MLX</a>` : ''}
    </div>
    <div class="layout">
      <nav class="snav" aria-label="Seções">
        ${lista.map(([k, t, ic, n]) => `<button class="snav-i" data-sec="${k}" aria-current="${S.secao === k}">${ic}<span>${t}</span>${n ? `<span class="count">${n}</span>` : ''}</button>`).join('')}
      </nav>
      <div id="aba" class="conteudo"></div>
    </div>
  </section>`;
  $$('[data-sec]', app).forEach(b => b.onclick = () => irPara(b.dataset.sec));
  ({ inicio, planejamento, resultados, leads: secLeads, relatorios, solicitacoes, materiais, pagamentos, documentos, acessos, indicacoes, historico, conta: minhaConta })[S.secao]();
}
function irPara(sec, extra) {
  S.secao = sec; Object.assign(S, extra || {});
  render();
  if (innerWidth < 900) $('#aba').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const titulo = (t, sub = '') => `<div class="sec-head"><h2>${t}</h2>${sub ? `<p>${sub}</p>` : ''}</div>`;

/* ---------- Início ---------- */
function inicio() {
  const pend = pendAprov(), prox = emAberto()[0];
  const ini = inicioSemana(hoje()), semana = postsEntre(isoData(ini), isoData(addDias(ini, 7)));
  const metasMes = S.metas.filter(m => m.mes === mesISO());
  const ultimoRel = S.rels[0];
  $('#aba').innerHTML = `
    ${pend.length ? `<div class="alert"><span>Você tem <b>${pend.length}</b> postage${pend.length > 1 ? 'ns' : 'm'} esperando aprovação.</span><button class="btn btn-sm" data-ir="planejamento">Ver agora</button></div>` : ''}
    <div class="tiles">
      ${completo() ? `<div class="tile"><span class="lbl">Próximo pagamento</span>${prox
        ? `<strong>${dinheiro(prox.valor)}</strong><small>${esc(prox.descricao)} · vence ${dataBR(prox.vencimento)}</small><div style="margin-top:10px">${badge(statusPagamento(prox))}</div>`
        : '<strong>Tudo em dia</strong><small>Nenhum pagamento em aberto.</small>'}</div>` :
        `<div class="tile"><span class="lbl">Para aprovar</span><strong>${pend.length}</strong><small>postage${pend.length === 1 ? 'm' : 'ns'} aguardando</small></div>`}
      <div class="tile"><span class="lbl">Postagens desta semana</span><strong>${semana.length}</strong><small>${semana.filter(p => p.status === 'publicado').length} já publicadas</small></div>
      <div class="tile accent"><span class="lbl">Último relatório</span>${ultimoRel
        ? `<strong style="font-size:22px">${esc(cap(mesNome(ultimoRel.mes)))}</strong><small><a class="link" href="/relatorio/?id=${ultimoRel.id}" target="_blank" rel="noopener">Abrir relatório →</a></small>`
        : '<strong style="font-size:22px">Em breve</strong><small>O primeiro relatório aparece aqui no fim do mês.</small>'}</div>
    </div>
    ${metasMes.length ? `<h3 class="section-h">Metas de ${esc(mesNome(mesISO()))}</h3><div class="metas">${metasMes.map(blocoMeta).join('')}</div>` : ''}
    <div class="atalhos">
      <button class="atalho" data-ir="solicitacoes">${ICON2.chat}<b>Pedir algo à MLX</b><small>Novo post, alteração, anúncio…</small></button>
      <button class="atalho" data-ir="materiais">${ICON2.upload}<b>Enviar fotos e vídeos</b><small>Material para os próximos posts</small></button>
      <button class="atalho" data-ir="resultados">${ICON2.chart}<b>Ver resultados</b><small>Seguidores, alcance, leads</small></button>
    </div>
    <h3 class="section-h">Atividade recente</h3>
    ${listaAtividades(S.ativ.slice(0, 8), 'Assim que algo acontecer, aparece aqui.')}
    ${S.ativ.length > 8 ? '<button class="btn btn-sm" data-ir="historico" style="margin-top:12px">Ver histórico completo</button>' : ''}`;
  $$('[data-ir]', $('#aba')).forEach(b => b.onclick = () => irPara(b.dataset.ir));
}

/* ---------- Planejamento ---------- */
function planejamento() {
  const el = $('#aba');
  const cab = `${titulo('Planejamento', 'Tudo o que vai ser publicado. Aprove ou peça ajustes direto por aqui.')}
    <div class="seg" role="group" aria-label="Visualização"><button type="button" data-modo="semana" aria-pressed="${S.modoPlan === 'semana'}">Semana</button><button type="button" data-modo="mes" aria-pressed="${S.modoPlan === 'mes'}">Mês</button></div>`;
  if (S.modoPlan === 'mes') {
    const fim = addMeses(S.mesPlan, 1), lista = postsEntre(S.mesPlan, fim);
    el.innerHTML = `${cab}
      <div class="week-nav"><div><span class="lbl" style="display:block;margin-bottom:4px;color:var(--dim)">${lista.length} postage${lista.length === 1 ? 'm' : 'ns'}</span><h2>${esc(cap(mesNome(S.mesPlan)))}</h2></div>
        <div class="ctrls">${S.mesPlan !== mesISO() ? '<button class="btn btn-sm" id="m-hoje">Este mês</button>' : ''}
          <button class="icon-btn" id="m-ant" aria-label="Mês anterior">${ICON.prev}</button><button class="icon-btn" id="m-prox" aria-label="Próximo mês">${ICON.next}</button></div></div>
      ${calendarioMes(lista, S.mesPlan)}
      <div id="dia-sel"></div>
      <div class="legenda">${Object.entries(STATUS_POST).filter(([k]) => k !== 'rascunho').map(([, [t, c]]) => `<span class="badge ${c}">${t}</span>`).join('')}</div>`;
    $('#m-ant').onclick = () => { S.mesPlan = addMeses(S.mesPlan, -1); planejamento(); };
    $('#m-prox').onclick = () => { S.mesPlan = addMeses(S.mesPlan, 1); planejamento(); };
    $('#m-hoje')?.addEventListener('click', () => { S.mesPlan = mesISO(); planejamento(); });
    $$('[data-post]', el).forEach(b => b.onclick = e => { e.stopPropagation(); abrirPost(b.dataset.post); });
    $$('[data-dia]', el).forEach(c => c.onclick = () => {
      const doDia = lista.filter(p => p.data_publicacao === c.dataset.dia);
      $$('.cal-d.sel', el).forEach(x => x.classList.remove('sel')); c.classList.add('sel');
      $('#dia-sel').innerHTML = doDia.length
        ? `<h4 class="mes-h">${esc(cap(diaSemana(c.dataset.dia)))}</h4><div class="list">${doDia.map(p => `<button class="row row-btn" data-ver="${p.id}"><div><h4>${esc(p.titulo)}</h4><div class="sub">${esc(p.formato)} · ${esc(p.rede)}</div></div><div class="right">${badge(STATUS_POST[p.status])}</div></button>`).join('')}</div>`
        : `<p class="vazio-txt" style="margin-top:12px">Nada programado para ${esc(diaSemana(c.dataset.dia))}.</p>`;
      $$('[data-ver]', el).forEach(b => b.onclick = () => abrirPost(b.dataset.ver));
    });
  } else {
    const ini = S.semana, fim = addDias(ini, 6), lista = postsEntre(isoData(ini), isoData(addDias(ini, 7)));
    const atual = isoData(ini) === isoData(inicioSemana(hoje()));
    const tit = `${dataBR(ini, { day: '2-digit', month: 'short' })} a ${dataBR(fim, { day: '2-digit', month: 'short' })}`.replace(/\./g, '');
    let vazio = '';
    if (!lista.length) {
      const prox = S.posts.find(p => p.data_publicacao > isoData(fim)), ant = [...S.posts].reverse().find(p => p.data_publicacao < isoData(ini));
      vazio = `<div class="empty-state"><b>Nenhuma postagem nesta semana</b>${S.posts.length ? 'Use as setas para navegar.' : 'Assim que a MLX subir os conteúdos, eles aparecem aqui.'}
        <div class="form-actions" style="justify-content:center;margin-top:14px">
          ${ant ? `<button class="btn btn-sm" data-irdata="${ant.data_publicacao}">← Última: ${dataBR(ant.data_publicacao, { day: '2-digit', month: '2-digit' })}</button>` : ''}
          ${prox ? `<button class="btn btn-sm" data-irdata="${prox.data_publicacao}">Próxima: ${dataBR(prox.data_publicacao, { day: '2-digit', month: '2-digit' })} →</button>` : ''}</div></div>`;
    }
    const pend = pendAprov();
    el.innerHTML = `${cab}
      ${pend.length ? `<div class="alert"><span><b>${pend.length}</b> aguardando sua aprovação${pend.length > 1 ? ` · a primeira é de ${dataBR(pend[0].data_publicacao, { day: '2-digit', month: '2-digit' })}` : ''}</span>${pend.some(p => inicioSemana(parseData(p.data_publicacao)).getTime() !== ini.getTime()) ? `<button class="btn btn-sm" data-irdata="${pend[0].data_publicacao}">Ir até lá</button>` : ''}</div>` : ''}
      <div class="week-nav"><div><span class="lbl" style="display:block;margin-bottom:4px;color:var(--dim)">${atual ? 'Esta semana' : 'Semana'}</span><h2>${esc(tit)}</h2></div>
        <div class="ctrls">${atual ? '' : '<button class="btn btn-sm" id="w-hoje">Esta semana</button>'}
          <button class="icon-btn" id="w-ant" aria-label="Semana anterior">${ICON.prev}</button><button class="icon-btn" id="w-prox" aria-label="Próxima semana">${ICON.next}</button></div></div>
      ${vazio || `<div class="posts">${lista.map(p => cardPost(p, S.url)).join('')}</div>`}`;
    $('#w-ant').onclick = () => { S.semana = addDias(S.semana, -7); planejamento(); };
    $('#w-prox').onclick = () => { S.semana = addDias(S.semana, 7); planejamento(); };
    $('#w-hoje')?.addEventListener('click', () => { S.semana = inicioSemana(hoje()); planejamento(); });
    ligarAcoesPost(el);
  }
  $$('[data-irdata]', el).forEach(b => b.onclick = () => { S.modoPlan = 'semana'; S.semana = inicioSemana(parseData(b.dataset.irdata)); planejamento(); });
  $$('[data-modo]', el).forEach(b => b.onclick = () => { S.modoPlan = b.dataset.modo; if (S.modoPlan === 'mes') S.mesPlan = mesISO(S.semana); planejamento(); });
}
function ligarAcoesPost(el) {
  $$('[data-aprovar]', el).forEach(b => b.onclick = () => responder(b.dataset.aprovar, true));
  $$('[data-ajuste]', el).forEach(b => b.onclick = () => pedirAjuste(b.dataset.ajuste));
  ligarLegendas(el);
}
function abrirPost(id) {
  const p = S.posts.find(x => x.id === id);
  abrirModal(dlg, `<div class="modal-post">${cardPost(p, S.url)}</div>`, d => ligarAcoesPost(d));
}
async function responder(id, aprovado, comentario = null) {
  const { error } = await sb.rpc('responder_postagem', { p_id: id, p_aprovado: aprovado, p_comentario: comentario });
  if (error) return toast(erroAmigavel(error), true);
  if (dlg.open) dlg.close();
  toast(aprovado ? 'Postagem aprovada! ✔' : 'Pedido de ajuste enviado para a MLX.');
  await carregar(); render();
}
function pedirAjuste(id) {
  const p = S.posts.find(x => x.id === id);
  abrirModal(dlg, `<h2>Pedir ajuste</h2><p class="dsub">${esc(p.titulo)} · ${esc(diaSemana(p.data_publicacao))}</p>
    <form id="f-aj"><div class="field"><label for="aj">O que você quer mudar?</label>
      <textarea id="aj" required maxlength="1000" placeholder="Ex.: trocar a foto de capa, ajustar o preço na legenda…">${esc(p.status === 'ajuste_solicitado' ? (p.comentario_cliente || '') : '')}</textarea></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Enviar pedido</button><button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div></form>`, d => {
    $$('[data-fechar]', d).forEach(b => b.onclick = () => d.close());
    $('#f-aj', d).onsubmit = e => { e.preventDefault(); const t = $('#aj', d).value.trim(); if (!t) return $('#aj', d).focus(); responder(id, false, t); };
  });
}

/* ---------- Resultados ---------- */
function resultados() {
  const el = $('#aba');
  el.innerHTML = `${titulo('Resultados', 'Os números das suas redes, mês a mês. Clique numa rede para ver a evolução.')}<div id="res"></div>`;
  vistaResultados($('#res'), { conta: S.conta, metricas: S.metricas, metas: S.metas, mes: S.mesRes, aoMudarMes: m => { S.mesRes = m; resultados(); } });
}

/* ---------- Leads ---------- */
function secLeads() {
  const el = $('#aba'), fim = addMeses(S.mesLeads, 1);
  const lista = S.leads.filter(l => l.data >= S.mesLeads && l.data < fim).sort((a, b) => b.data.localeCompare(a.data));
  el.innerHTML = `${titulo('Leads', 'Quem chegou até você e como está cada conversa.')}
    <div class="week-nav"><div><h2>${esc(cap(mesNome(S.mesLeads)))}</h2></div>
      <div class="ctrls"><button class="icon-btn" id="l-ant" aria-label="Mês anterior">${ICON.prev}</button><button class="icon-btn" id="l-prox" aria-label="Próximo mês">${ICON.next}</button></div></div>
    ${resumoLeads(lista)}
    ${lista.length ? `<div class="list" style="margin-top:18px">${lista.map(l => linhaLead(l)).join('')}</div>` : '<div class="empty-state" style="margin-top:18px">Nenhum lead registrado neste mês.</div>'}`;
  $('#l-ant').onclick = () => { S.mesLeads = addMeses(S.mesLeads, -1); secLeads(); };
  $('#l-prox').onclick = () => { S.mesLeads = addMeses(S.mesLeads, 1); secLeads(); };
}

/* ---------- Relatórios ---------- */
function relatorios() {
  $('#aba').innerHTML = `${titulo('Relatórios', 'O resumo mensal do trabalho da MLX. Abra e baixe em PDF.')}
    ${S.rels.length ? `<div class="rels">${S.rels.map(r => `
      <a class="rel" href="/relatorio/?id=${r.id}" target="_blank" rel="noopener">
        <span class="rel-ic">${ICON2.report}</span>
        <span><b>${esc(cap(mesNome(r.mes)))}</b><small>Publicado em ${dataBR((r.publicado_em || r.criado_em).slice(0, 10))}</small></span>
        <span class="btn btn-sm">Abrir / baixar PDF</span>
      </a>`).join('')}</div>` : '<div class="empty-state"><b>Nenhum relatório ainda</b>No fim de cada mês, a MLX publica o relatório aqui e você recebe um aviso.</div>'}`;
}

/* ---------- Solicitações ---------- */
function solicitacoes() {
  const el = $('#aba');
  el.innerHTML = `${titulo('Solicitações', 'Peça um post novo, uma alteração, um anúncio… e acompanhe o andamento.')}
    <form class="panel" id="f-sol" novalidate>
      <h3>Nova solicitação</h3>
      <div class="grid-2">
        <div class="field"><label for="s-tipo">Tipo</label><select id="s-tipo">${['Novo post', 'Alteração', 'Anúncio', 'Arte / design', 'Outro'].map(t => `<option>${t}</option>`).join('')}</select></div>
        <div class="field"><label for="s-prazo">Para quando? (opcional)</label><input id="s-prazo" type="date" min="${isoData(hoje())}"></div>
        <div class="field full"><label for="s-tit">Resumo</label><input id="s-tit" maxlength="140" placeholder="Ex.: Post sobre a promoção de Dia das Crianças"></div>
        <div class="field full"><label for="s-desc">Detalhes</label><textarea id="s-desc" maxlength="3000" placeholder="Conte o que você precisa. Se tiver fotos, envie em “Enviar material”."></textarea></div>
      </div>
      <div id="s-msg" class="form-msg err" hidden></div>
      <button class="btn btn-primary" type="submit">Enviar para a MLX</button>
    </form>
    <h3 class="section-h">Suas solicitações</h3>
    ${S.sols.length ? `<div class="list">${S.sols.map(s => `
      <div class="row">
        <div><h4>${esc(s.titulo)}</h4>
          <div class="sub">${esc(s.tipo)} · aberta por ${esc(s.criado_por_nome || '—')} em ${dataBR(s.criado_em.slice(0, 10))}${s.prazo ? ` · para ${dataBR(s.prazo)}` : ''}</div>
          ${s.descricao ? `<p class="sol-desc">${esc(s.descricao)}</p>` : ''}
          ${s.resposta ? `<div class="resp"><b>MLX:</b> ${esc(s.resposta)}</div>` : ''}</div>
        <div class="right">${badge(STATUS_SOL[s.status])}${s.status === 'aberta' && (s.criado_por === S.eu.id || completo()) ? `<button class="btn btn-sm btn-ghost" data-cancelar="${s.id}">Cancelar</button>` : ''}</div>
      </div>`).join('')}</div>` : '<div class="empty-state">Nenhuma solicitação ainda.</div>'}`;
  $('#f-sol').onsubmit = async e => {
    e.preventDefault();
    const m = $('#s-msg'), tit = $('#s-tit').value.trim();
    if (tit.length < 2) { m.textContent = 'Escreva um resumo do que você precisa.'; m.hidden = false; return; }
    e.submitter.disabled = true;
    const { error } = await sb.from('solicitacoes').insert({
      conta_id: S.conta.id, criado_por: S.eu.id, criado_por_nome: S.eu.nome, tipo: $('#s-tipo').value,
      titulo: tit, descricao: $('#s-desc').value.trim() || null, prazo: $('#s-prazo').value || null
    });
    e.submitter.disabled = false;
    if (error) { m.textContent = erroAmigavel(error); m.hidden = false; return; }
    toast('Solicitação enviada! A MLX já foi avisada.');
    await carregar(); render();
  };
  $$('[data-cancelar]', el).forEach(b => b.onclick = async () => {
    if (!confirm('Cancelar essa solicitação?')) return;
    const { error } = await sb.rpc('cancelar_solicitacao', { p_id: b.dataset.cancelar });
    if (error) return toast(erroAmigavel(error), true);
    toast('Solicitação cancelada.'); await carregar(); render();
  });
}

/* ---------- Materiais ---------- */
function materiais() {
  const el = $('#aba');
  const grupos = {};
  S.mats.forEach(m => { (grupos[m.criado_em.slice(0, 7)] ||= []).push(m); });
  el.innerHTML = `${titulo('Enviar material', 'Mande fotos, vídeos e arquivos para a MLX usar nos seus conteúdos.')}
    <form class="panel drop" id="f-mat">
      <label class="dropzone" id="dz">${ICON2.upload}<b>Arraste os arquivos aqui ou clique para escolher</b>
        <small>Fotos são otimizadas automaticamente. Vídeos até 50 MB cada. Para vídeos maiores, mande o link do Google Drive em Solicitações.</small>
        <input id="m-arq" type="file" multiple accept="image/*,video/*,application/pdf,.zip" hidden></label>
      <div class="field" style="margin-top:14px"><label for="m-obs">Observação (opcional)</label><input id="m-obs" maxlength="500" placeholder="Ex.: fotos do novo cardápio para o post de sexta"></div>
      <div class="fila" id="fila"></div>
      <div class="progress" id="prog" hidden><i></i></div>
      <button class="btn btn-primary" type="submit" id="m-env" disabled>Enviar</button>
    </form>
    <h3 class="section-h">Enviados (${S.mats.length})</h3>
    ${S.mats.length ? Object.entries(grupos).map(([mes, lista]) => `
      <h4 class="mes-h">${esc(cap(mesNome(mes + '-01')))}</h4>
      <div class="mats">${lista.map(m => cardMaterial(m)).join('')}</div>`).join('') : '<div class="empty-state">Nada enviado ainda.</div>'}`;

  let arquivos = [];
  const desenhar = () => {
    $('#fila').innerHTML = arquivos.map((f, i) => `<div class="fila-i"><span>${esc(f.name)}</span><small>${bytes(f.size)}${f.size > LIMITE_ARQUIVO ? ' · <b style="color:var(--bad)">grande demais</b>' : ''}</small><button type="button" class="link" data-rm="${i}">remover</button></div>`).join('');
    $$('[data-rm]', el).forEach(b => b.onclick = () => { arquivos.splice(+b.dataset.rm, 1); desenhar(); });
    $('#m-env').disabled = !arquivos.length;
    $('#m-env').textContent = arquivos.length ? `Enviar ${arquivos.length} arquivo${arquivos.length > 1 ? 's' : ''}` : 'Enviar';
  };
  const add = fs => { arquivos.push(...fs); desenhar(); };
  $('#m-arq').onchange = e => { add([...e.target.files]); e.target.value = ''; };
  const dz = $('#dz');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('on'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('on'); }));
  dz.addEventListener('drop', e => add([...e.dataTransfer.files]));

  $('#f-mat').onsubmit = async e => {
    e.preventDefault();
    const grandes = arquivos.filter(f => f.size > LIMITE_ARQUIVO && !f.type.startsWith('image/'));
    if (grandes.length) return toast(`"${grandes[0].name}" passa de 50 MB. Mande o link do Drive em Solicitações.`, true);
    const btn = $('#m-env'), barra = $('#prog i'); btn.disabled = true; $('#prog').hidden = false;
    const obs = $('#m-obs').value.trim() || null;
    let ok = 0;
    for (const [i, f0] of arquivos.entries()) {
      btn.textContent = `Enviando ${i + 1} de ${arquivos.length}…`;
      const f = await comprimirImagem(f0);
      const path = `${S.conta.id}/${crypto.randomUUID().slice(0, 8)}-${nomeSeguro(f.name)}`;
      const up = await sb.storage.from('materiais').upload(path, f, { contentType: f.type || 'application/octet-stream' });
      if (up.error) { toast(`${f.name}: ${erroAmigavel(up.error)}`, true); continue; }
      const { error } = await sb.from('materiais').insert({ conta_id: S.conta.id, enviado_por: S.eu.id, enviado_por_nome: S.eu.nome, path, nome_arquivo: f0.name, tipo_mime: f.type, tamanho: f.size, observacao: obs });
      if (error) { await sb.storage.from('materiais').remove([path]); toast(erroAmigavel(error), true); continue; }
      ok++; barra.style.width = `${((i + 1) / arquivos.length) * 100}%`;
    }
    if (ok) toast(`${ok} arquivo${ok > 1 ? 's enviados' : ' enviado'}! A MLX foi avisada.`);
    await carregar(); render();
  };
  ligarMateriais(el);
}
function cardMaterial(m) {
  const img = (m.tipo_mime || '').startsWith('image/'), vid = (m.tipo_mime || '').startsWith('video/');
  return `<div class="mat" data-mat="${m.id}">
    <div class="mat-prev">${img ? `<img src="${esc(S.urlMat(m.path))}" alt="" loading="lazy">` : `<span>${vid ? 'VÍDEO' : (m.nome_arquivo.split('.').pop() || 'arquivo').toUpperCase()}</span>`}</div>
    <div class="mat-info"><b title="${esc(m.nome_arquivo)}">${esc(m.nome_arquivo)}</b><small>${bytes(m.tamanho)} · ${esc(m.enviado_por_nome || '')} · ${dataBR(m.criado_em.slice(0, 10), { day: '2-digit', month: '2-digit' })}</small>
      ${m.observacao ? `<small class="mat-obs">${esc(m.observacao)}</small>` : ''}
      <div class="mat-acts">${badge(STATUS_MAT[m.status])}<button class="link" data-baixar>baixar</button>${m.enviado_por === S.eu.id && m.status === 'novo' ? '<button class="link" data-apagar>apagar</button>' : ''}</div></div>
  </div>`;
}
function ligarMateriais(el) {
  $$('[data-mat]', el).forEach(c => {
    const m = S.mats.find(x => x.id === c.dataset.mat);
    $('[data-baixar]', c).onclick = () => baixar('materiais', m.path);
    $('[data-apagar]', c)?.addEventListener('click', async () => {
      if (!confirm(`Apagar "${m.nome_arquivo}"?`)) return;
      const { error } = await sb.from('materiais').delete().eq('id', m.id);
      if (error) return toast(erroAmigavel(error), true);
      await sb.storage.from('materiais').remove([m.path]);
      toast('Arquivo apagado.'); await carregar(); render();
    });
  });
}

/* ---------- Pagamentos ---------- */
function pagamentos() {
  const abertos = emAberto(), pagos = S.pags.filter(p => p.status === 'pago').sort((a, b) => b.vencimento.localeCompare(a.vencimento));
  const pix = S.config.chave_pix, total = abertos.reduce((s, p) => s + Number(p.valor), 0);
  const linha = p => `<div class="row"><div><h4>${esc(p.descricao)}</h4>
      <div class="sub">${p.status === 'pago' ? `Pago em ${dataBR(p.pago_em || p.vencimento)}` : `Vencimento ${dataBR(p.vencimento)}`}${p.observacao ? ` · ${esc(p.observacao)}` : ''}</div></div>
    <div class="right"><span class="val">${dinheiro(p.valor)}</span>${badge(statusPagamento(p))}
      ${p.status === 'pendente' && p.link_pagamento ? `<a class="btn btn-primary btn-sm" href="${esc(p.link_pagamento)}" target="_blank" rel="noopener">Pagar</a>` : ''}</div></div>`;
  $('#aba').innerHTML = `${titulo('Pagamentos')}
    ${pix && abertos.length ? `<div class="card accent" style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
      <div><span class="lbl" style="display:block;color:var(--dim);margin-bottom:6px">Pague com PIX</span><b style="font-size:16px">${esc(pix)}</b></div>
      <button class="btn btn-sm" id="cp-pix">${ICON.copy}Copiar chave</button></div>` : ''}
    <h3 class="section-h">Em aberto${abertos.length ? ` · ${dinheiro(total)}` : ''}</h3>
    ${abertos.length ? `<div class="list">${abertos.map(linha).join('')}</div>` : '<div class="empty-state"><b>Nenhum pagamento em aberto</b>Está tudo em dia.</div>'}
    ${pagos.length ? `<h3 class="section-h">Histórico</h3><div class="list">${pagos.slice(0, 24).map(linha).join('')}</div>` : ''}`;
  $('#cp-pix')?.addEventListener('click', () => copiar(pix));
}

/* ---------- Documentos ---------- */
function documentos() {
  const cats = ['Contrato', 'Proposta', 'Briefing', 'Nota fiscal', 'Outro'];
  const el = $('#aba');
  el.innerHTML = `${titulo('Documentos', 'Contratos, notas fiscais, briefings e outros arquivos.')}
    ${S.docs.length ? cats.filter(c => S.docs.some(d => d.categoria === c)).map(c => `
      <h3 class="section-h">${c === 'Nota fiscal' ? 'Notas fiscais' : c + 's'}</h3>
      <div class="list">${S.docs.filter(d => d.categoria === c).map(d => `
        <div class="row"><div><h4>${esc(d.titulo)}</h4><div class="sub">${dataBR(d.criado_em.slice(0, 10))} · ${bytes(d.tamanho)}</div></div>
          <div class="right"><button class="btn btn-sm" data-doc="${d.id}">${ICON2.down}Baixar</button></div></div>`).join('')}</div>`).join('')
    : '<div class="empty-state"><b>Nenhum documento ainda</b>Quando a MLX adicionar contratos ou notas, eles aparecem aqui.</div>'}`;
  $$('[data-doc]', el).forEach(b => b.onclick = () => baixar('documentos', S.docs.find(d => d.id === b.dataset.doc).path));
}

/* ---------- Acessos ---------- */
function acessos() {
  $('#aba').innerHTML = `${titulo('Acessos das redes')}<div id="acs"></div>`;
  blocoAcessos($('#acs'), { contaId: S.conta.id, acessos: S.acs, aoMudar: async () => { await carregar(); acessos(); } });
}

/* ---------- Indicações ---------- */
function indicacoes() {
  const el = $('#aba'), cod = S.conta.codigo_indicacao || '';
  const ganho = S.inds.filter(i => i.status === 'fechou').reduce((s, i) => s + Number(i.desconto_valor || 0), 0);
  const msg = `Oi! Trabalho com a MLX Mind (marketing, tráfego pago e sites) e recomendo demais. Se quiser conversar com eles, fala que foi indicação minha: código ${cod}. https://mlxmind.com.br`;
  el.innerHTML = `${titulo('Indique e ganhe')}
    <div class="ref-grid">
      <div class="card accent">
        <h3>Seu desconto: ${dinheiro(ganho)}</h3>
        <p>${esc(S.config.desconto_indicacao || '')}</p>
        <div class="code-box"><div><span class="lbl" style="display:block;color:var(--dim);margin-bottom:4px">Código da ${esc(S.conta.nome)}</span><code>${esc(cod)}</code></div>
          <button class="btn btn-sm" id="cp-cod">${ICON.copy}Copiar</button></div>
        <div class="form-actions">
          <a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">${ICON.wa}Compartilhar no WhatsApp</a>
          <button class="btn btn-sm" id="cp-msg">${ICON.copy}Copiar mensagem</button></div>
        ${S.config.regras_indicacao ? `<p style="margin-top:18px;font-size:13px">${esc(S.config.regras_indicacao)}</p>` : ''}
      </div>
      <div class="card"><h3>Indicar alguém agora</h3>
        <form id="f-ind" novalidate>
          <div class="field"><label for="i-nome">Nome da pessoa ou empresa</label><input id="i-nome" maxlength="120"></div>
          <div class="field"><label for="i-cont">WhatsApp ou Instagram</label><input id="i-cont" maxlength="120" placeholder="(16) 99999-9999 ou @empresa"></div>
          <div class="field"><label for="i-obs">Observação (opcional)</label><textarea id="i-obs" maxlength="500"></textarea></div>
          <div id="i-msg" class="form-msg err" hidden></div>
          <button class="btn btn-primary" type="submit">Enviar indicação</button></form></div>
    </div>
    <h3 class="section-h" style="margin-top:32px">Indicações da ${esc(S.conta.nome)}</h3>
    ${S.inds.length ? `<div class="list">${S.inds.map(i => `<div class="row">
      <div><h4>${esc(i.nome_indicado)}</h4><div class="sub">Indicado em ${dataBR(i.criado_em.slice(0, 10))}${i.contato ? ` · ${esc(i.contato)}` : ''}</div></div>
      <div class="right">${i.status === 'fechou' && Number(i.desconto_valor) > 0 ? `<span class="val">-${dinheiro(i.desconto_valor)}</span>${badge(i.desconto_aplicado ? ['Desconto aplicado', 'b-purple'] : ['Desconto a receber', 'b-ok'])}` : ''}${badge(STATUS_IND[i.status])}</div></div>`).join('')}</div>`
      : '<div class="empty-state">Nenhuma indicação ainda.</div>'}`;
  $('#cp-cod').onclick = () => copiar(cod);
  $('#cp-msg').onclick = () => copiar(msg);
  $('#f-ind').onsubmit = async e => {
    e.preventDefault();
    const nome = $('#i-nome').value.trim(), contato = $('#i-cont').value.trim(), m = $('#i-msg');
    if (nome.length < 2) { m.textContent = 'Informe quem você está indicando.'; m.hidden = false; return; }
    if (!contato) { m.textContent = 'Passe um WhatsApp ou Instagram.'; m.hidden = false; return; }
    const { error } = await sb.from('indicacoes').insert({ conta_id: S.conta.id, criado_por: S.eu.id, nome_indicado: nome, contato, observacao: $('#i-obs').value.trim() || null });
    if (error) { m.textContent = erroAmigavel(error); m.hidden = false; return; }
    toast('Indicação enviada! Obrigado 💜'); await carregar(); render();
  };
}

/* ---------- Histórico ---------- */
function historico() {
  $('#aba').innerHTML = `${titulo('Histórico', 'Tudo o que aconteceu na sua conta: quem aprovou, o que foi enviado, o que a MLX publicou.')}${listaAtividades(S.ativ)}`;
}

/* ---------- Minha conta ---------- */
function minhaConta() {
  const el = $('#aba');
  el.innerHTML = `${titulo('Minha conta')}
    <div class="ref-grid">
      <div class="card">
        <h3>${esc(S.eu.nome)}</h3>
        <p>${esc(S.eu.email)}<br>${S.eu.permissao === 'completo' ? 'Acesso completo' : 'Acesso ao conteúdo (planejamento, resultados, relatórios e solicitações)'}</p>
        <label class="check" style="margin-top:18px"><input type="checkbox" id="pref-email"${S.eu.receber_emails ? ' checked' : ''}> Receber avisos por e-mail (posts para aprovar, relatórios${completo() ? ', pagamentos' : ''})</label>
      </div>
      <form class="card" id="f-senha" novalidate>
        <h3>Trocar senha</h3>
        <div class="field"><label for="ns1">Nova senha</label><input id="ns1" type="password" autocomplete="new-password" minlength="8"></div>
        <div class="field"><label for="ns2">Repita a nova senha</label><input id="ns2" type="password" autocomplete="new-password" minlength="8"></div>
        <div id="ns-msg" class="form-msg err" hidden></div>
        <button class="btn btn-primary" type="submit">Salvar nova senha</button>
      </form>
    </div>
    <h3 class="section-h" style="margin-top:28px">Pessoas com acesso à ${esc(S.conta.nome)}</h3>
    <div class="list">${S.membros.map(p => `<div class="row"><div><h4>${esc(p.nome)}${p.id === S.eu.id ? ' (você)' : ''}</h4><div class="sub">${esc(p.email || '')}</div></div>
      <div class="right">${badge(p.permissao === 'completo' ? ['Acesso completo', 'b-purple'] : ['Só conteúdo', 'b-info'])}${p.ativo ? '' : badge(['Suspenso', 'b-dim'])}</div></div>`).join('')}</div>
    <p style="color:var(--dim);font-size:13px;margin-top:12px">Para adicionar ou remover alguém, fale com a MLX.</p>`;
  $('#pref-email').onchange = async e => {
    const { error } = await sb.rpc('preferencia_emails', { p_receber: e.target.checked });
    if (error) { e.target.checked = !e.target.checked; return toast(erroAmigavel(error), true); }
    S.eu.receber_emails = e.target.checked; toast(e.target.checked ? 'Avisos por e-mail ligados.' : 'Avisos por e-mail desligados.');
  };
  $('#f-senha').onsubmit = async e => {
    e.preventDefault();
    const a = $('#ns1').value, b = $('#ns2').value, m = $('#ns-msg');
    if (a.length < 8) { m.textContent = 'Use pelo menos 8 caracteres.'; m.hidden = false; return; }
    if (a !== b) { m.textContent = 'As senhas não são iguais.'; m.hidden = false; return; }
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) { m.textContent = erroAmigavel(error); m.hidden = false; return; }
    m.hidden = true; $('#ns1').value = $('#ns2').value = ''; toast('Senha alterada!');
  };
}
