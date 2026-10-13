/* =========================================================
   MLX Mind · Área do cliente
   ========================================================= */
import {
  sb, $, $$, esc, dinheiro, parseData, isoData, hoje, addDias, inicioSemana, dataBR, diaSemana,
  STATUS_POST, STATUS_IND, statusPagamento, badge, urlsAssinadas, galeria, toast, erroAmigavel,
  copiar, montarLogin, montarNovaSenha, LOGO, ICON
} from './comum.js';

const app = $('#app'), topUser = $('#top-user'), dlg = $('#dlg');
$('#logo').outerHTML = LOGO;

const S = { uid: null, perfil: null, config: {}, posts: [], pags: [], inds: [], semana: inicioSemana(hoje()), aba: 'postagens', url: () => '' };
let recuperando = false;

/* ---------- sessão ---------- */
sb.auth.onAuthStateChange((evento, sessao) => {
  if (evento === 'PASSWORD_RECOVERY') {
    recuperando = true;
    topUser.hidden = true;
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
    montarLogin(app, {
      eyebrow: 'Área do cliente',
      titulo: 'Entre na sua área',
      subtitulo: 'Veja as postagens da semana, aprove conteúdos, acompanhe pagamentos e indique amigos.'
    });
    return;
  }
  app.innerHTML = '<div class="loading"><div><div class="spin"></div>Carregando sua área…</div></div>';
  try {
    const uid = session.user.id;
    const [perfil, config, posts, pags, inds] = await Promise.all([
      sb.from('perfis').select('*').eq('id', uid).single(),
      sb.from('configuracoes').select('*').eq('id', 1).single(),
      sb.from('postagens').select('*').eq('cliente_id', uid).order('data_publicacao'),
      sb.from('pagamentos').select('*').eq('cliente_id', uid).order('vencimento'),
      sb.from('indicacoes').select('*').eq('cliente_id', uid).order('criado_em', { ascending: false })
    ]);
    for (const r of [perfil, config, posts, pags, inds]) if (r.error) throw r.error;
    S.perfil = perfil.data; S.config = config.data || {}; S.posts = posts.data; S.pags = pags.data; S.inds = inds.data;
    S.url = await urlsAssinadas(S.posts.flatMap(p => p.midias || []));
    montarTopo();
    render();
  } catch (e) {
    app.innerHTML = `<div class="loading"><div style="text-align:center">Não foi possível carregar sua área.<br><small>${esc(erroAmigavel(e))}</small><br><br><button class="btn" id="tentar">Tentar de novo</button></div></div>`;
    $('#tentar').onclick = iniciar;
  }
}

function montarTopo() {
  const admin = S.perfil.papel === 'admin';
  topUser.innerHTML = `
    <span class="who">Olá, <b>${esc(S.perfil.nome.split(' ')[0] || 'cliente')}</b></span>
    ${admin ? '<a class="btn btn-sm" href="/admin/">Painel admin</a>' : ''}
    <button class="btn btn-sm btn-ghost" id="sair">${ICON.out}Sair</button>`;
  topUser.hidden = false;
  $('#sair').onclick = async () => { await sb.auth.signOut(); };
}

/* ---------- cálculos ---------- */
const pendentesAprovacao = () => S.posts.filter(p => p.status === 'aguardando_aprovacao');
const emAberto = () => S.pags.filter(p => p.status === 'pendente').sort((a, b) => a.vencimento.localeCompare(b.vencimento));
const descontoGanho = () => S.inds.filter(i => i.status === 'fechou').reduce((s, i) => s + Number(i.desconto_valor || 0), 0);
function postsDaSemana(ini) {
  const a = isoData(ini), b = isoData(addDias(ini, 7));
  return S.posts.filter(p => p.data_publicacao >= a && p.data_publicacao < b);
}

/* ---------- tela principal ---------- */
function render() {
  const p = S.perfil, pend = pendentesAprovacao(), abertos = emAberto(), prox = abertos[0];
  const semanaAtual = postsDaSemana(inicioSemana(hoje()));
  const fechadas = S.inds.filter(i => i.status === 'fechou').length;

  app.innerHTML = `
  <section class="dash">
    ${p.papel === 'admin' ? '<div class="alert">Você entrou com um login da equipe MLX. Essa tela mostra o que o cliente vê. <a class="btn btn-sm" href="/admin/">Ir para o painel admin</a></div>' : ''}
    <div class="hello">
      <div>
        <span class="eyebrow">${esc(p.empresa || 'Área do cliente')}</span>
        <h1>Olá, ${esc(p.nome.split(' ')[0] || 'tudo bem')}!</h1>
        <p>Tudo o que a MLX está fazendo por você, num lugar só.</p>
      </div>
      ${S.config.whatsapp ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/${esc(S.config.whatsapp)}?text=${encodeURIComponent('Oi, MLX! Aqui é ' + (p.nome || '') + (p.empresa ? ' da ' + p.empresa : '') + '.')}">${ICON.wa}Falar com a MLX</a>` : ''}
    </div>

    <div class="tiles">
      <div class="tile">
        <span class="lbl">Próximo pagamento</span>
        ${prox
          ? `<strong>${dinheiro(prox.valor)}</strong><small>${esc(prox.descricao)} · vence ${dataBR(prox.vencimento)}</small><div style="margin-top:10px">${badge(statusPagamento(prox))}</div>`
          : '<strong>Tudo em dia</strong><small>Nenhum pagamento em aberto.</small>'}
      </div>
      <div class="tile">
        <span class="lbl">Postagens desta semana</span>
        <strong>${semanaAtual.length}</strong>
        <small>${pend.length ? `${pend.length} aguardando sua aprovação` : 'Nada pendente de aprovação'}</small>
      </div>
      <div class="tile accent">
        <span class="lbl">Indique e ganhe</span>
        <strong>${dinheiro(descontoGanho())}</strong>
        <small>em descontos · ${fechadas} indicaç${fechadas === 1 ? 'ão fechou' : 'ões fecharam'}</small>
      </div>
    </div>

    ${pend.length ? `<div class="alert"><span>Você tem <b>${pend.length}</b> postage${pend.length > 1 ? 'ns' : 'm'} esperando sua aprovação.</span><button class="btn btn-sm" id="ver-pend">Ver agora</button></div>` : ''}

    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-aba="postagens" aria-selected="${S.aba === 'postagens'}">Postagens ${pend.length ? `<span class="count">${pend.length}</span>` : ''}</button>
      <button class="tab" role="tab" data-aba="pagamentos" aria-selected="${S.aba === 'pagamentos'}">Pagamentos ${abertos.length ? `<span class="count">${abertos.length}</span>` : ''}</button>
      <button class="tab" role="tab" data-aba="indicacoes" aria-selected="${S.aba === 'indicacoes'}">Indicações</button>
    </div>
    <div id="aba"></div>
  </section>`;

  $$('.tab', app).forEach(t => t.onclick = () => { S.aba = t.dataset.aba; render(); });
  $('#ver-pend')?.addEventListener('click', () => {
    S.aba = 'postagens';
    S.semana = inicioSemana(parseData(pend[0].data_publicacao));
    render();
    $('#aba').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  ({ postagens: abaPostagens, pagamentos: abaPagamentos, indicacoes: abaIndicacoes })[S.aba]();
}

/* ---------- Postagens ---------- */
function abaPostagens() {
  const el = $('#aba'), ini = S.semana, fim = addDias(ini, 6);
  const lista = postsDaSemana(ini);
  const ehAtual = isoData(ini) === isoData(inicioSemana(hoje()));
  const titulo = `${dataBR(ini, { day: '2-digit', month: 'short' })} a ${dataBR(fim, { day: '2-digit', month: 'short' })}`.replace(/\./g, '');

  let vazio = '';
  if (!lista.length) {
    const prox = S.posts.find(p => p.data_publicacao > isoData(fim));
    const ant = [...S.posts].reverse().find(p => p.data_publicacao < isoData(ini));
    vazio = `<div class="empty-state"><b>Nenhuma postagem nesta semana</b>
      ${S.posts.length ? 'Use as setas para navegar entre as semanas.' : 'Assim que a MLX subir os conteúdos, eles aparecem aqui.'}
      <div class="form-actions" style="justify-content:center;margin-top:14px">
        ${ant ? `<button class="btn btn-sm" data-ir="${ant.data_publicacao}">← Última: ${dataBR(ant.data_publicacao, { day: '2-digit', month: '2-digit' })}</button>` : ''}
        ${prox ? `<button class="btn btn-sm" data-ir="${prox.data_publicacao}">Próxima: ${dataBR(prox.data_publicacao, { day: '2-digit', month: '2-digit' })} →</button>` : ''}
      </div></div>`;
  }

  el.innerHTML = `
    <div class="week-nav">
      <div><span class="lbl" style="display:block;margin-bottom:4px;color:var(--dim)">${ehAtual ? 'Esta semana' : 'Semana'}</span><h2>${esc(titulo)}</h2></div>
      <div class="ctrls">
        ${ehAtual ? '' : '<button class="btn btn-sm" id="w-hoje">Esta semana</button>'}
        <button class="icon-btn" id="w-ant" aria-label="Semana anterior">${ICON.prev}</button>
        <button class="icon-btn" id="w-prox" aria-label="Próxima semana">${ICON.next}</button>
      </div>
    </div>
    ${vazio || `<div class="posts">${lista.map(cardPost).join('')}</div>`}`;

  $('#w-ant').onclick = () => { S.semana = addDias(S.semana, -7); abaPostagens(); };
  $('#w-prox').onclick = () => { S.semana = addDias(S.semana, 7); abaPostagens(); };
  $('#w-hoje')?.addEventListener('click', () => { S.semana = inicioSemana(hoje()); abaPostagens(); });
  $$('[data-ir]', el).forEach(b => b.onclick = () => { S.semana = inicioSemana(parseData(b.dataset.ir)); abaPostagens(); });
  $$('[data-aprovar]', el).forEach(b => b.onclick = () => responder(b.dataset.aprovar, true));
  $$('[data-ajuste]', el).forEach(b => b.onclick = () => pedirAjuste(b.dataset.ajuste));
  $$('[data-mais]', el).forEach(b => b.onclick = () => {
    const c = b.previousElementSibling; c.classList.toggle('open'); b.textContent = c.classList.contains('open') ? 'ver menos' : 'ver mais';
  });
}

function cardPost(p) {
  const futuro = p.data_publicacao >= isoData(hoje());
  let acoes = '';
  if (p.status === 'aguardando_aprovacao') {
    acoes = `<button class="btn btn-ok btn-sm" data-aprovar="${p.id}">Aprovar</button><button class="btn btn-sm" data-ajuste="${p.id}">Pedir ajuste</button>`;
  } else if (p.status === 'ajuste_solicitado') {
    acoes = `<button class="btn btn-ok btn-sm" data-aprovar="${p.id}">Aprovar assim mesmo</button><button class="btn btn-sm" data-ajuste="${p.id}">Editar pedido</button>`;
  } else if (p.status === 'aprovado' && futuro) {
    acoes = `<button class="btn btn-ghost btn-sm" data-ajuste="${p.id}">Pedir ajuste</button>`;
  }
  const longa = (p.legenda || '').length > 180;
  return `
  <article class="post">
    ${galeria(p.midias, S.url, `<span class="chip">${esc(p.formato)}</span>`)}
    <div class="post-body">
      <div class="post-meta"><span>${esc(diaSemana(p.data_publicacao))} · ${esc(p.rede)}</span>${badge(STATUS_POST[p.status])}</div>
      <h3>${esc(p.titulo)}</h3>
      ${p.legenda ? `<p class="caption">${esc(p.legenda)}</p>${longa ? '<button class="link" data-mais>ver mais</button>' : ''}` : ''}
      ${p.status === 'ajuste_solicitado' && p.comentario_cliente ? `<div class="note"><b>Seu pedido:</b> ${esc(p.comentario_cliente)}</div>` : ''}
      ${acoes ? `<div class="post-actions">${acoes}</div>` : ''}
    </div>
  </article>`;
}

async function responder(id, aprovado, comentario = null) {
  const { error } = await sb.rpc('responder_postagem', { p_id: id, p_aprovado: aprovado, p_comentario: comentario });
  if (error) return toast(erroAmigavel(error), true);
  const p = S.posts.find(x => x.id === id);
  p.status = aprovado ? 'aprovado' : 'ajuste_solicitado';
  p.comentario_cliente = comentario;
  toast(aprovado ? 'Postagem aprovada! ✔' : 'Pedido de ajuste enviado para a MLX.');
  render();
}

function pedirAjuste(id) {
  const p = S.posts.find(x => x.id === id);
  dlg.innerHTML = `
    <button class="x" aria-label="Fechar" data-fechar>×</button>
    <h2>Pedir ajuste</h2>
    <p class="dsub">${esc(p.titulo)} · ${esc(diaSemana(p.data_publicacao))}</p>
    <form id="f-ajuste">
      <div class="field"><label for="aj-txt">O que você quer mudar?</label>
        <textarea id="aj-txt" required maxlength="1000" placeholder="Ex.: trocar a foto de capa, ajustar o preço na legenda…">${esc(p.status === 'ajuste_solicitado' ? (p.comentario_cliente || '') : '')}</textarea></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Enviar pedido</button><button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div>
    </form>`;
  dlg.showModal();
  $$('[data-fechar]', dlg).forEach(b => b.onclick = () => dlg.close());
  $('#f-ajuste').onsubmit = e => {
    e.preventDefault();
    const t = $('#aj-txt').value.trim();
    if (!t) return $('#aj-txt').focus();
    dlg.close();
    responder(id, false, t);
  };
}

/* ---------- Pagamentos ---------- */
function abaPagamentos() {
  const el = $('#aba'), abertos = emAberto();
  const pagos = S.pags.filter(p => p.status === 'pago').sort((a, b) => b.vencimento.localeCompare(a.vencimento));
  const pix = S.config.chave_pix;
  const linha = p => `
    <div class="row">
      <div><h4>${esc(p.descricao)}</h4>
        <div class="sub">${p.status === 'pago' ? `Pago em ${dataBR(p.pago_em || p.vencimento)}` : `Vencimento ${dataBR(p.vencimento)}`}${p.observacao ? ` · ${esc(p.observacao)}` : ''}</div></div>
      <div class="right">
        <span class="val">${dinheiro(p.valor)}</span>${badge(statusPagamento(p))}
        ${p.status === 'pendente' && p.link_pagamento ? `<a class="btn btn-primary btn-sm" href="${esc(p.link_pagamento)}" target="_blank" rel="noopener">Pagar</a>` : ''}
      </div>
    </div>`;
  const total = abertos.reduce((s, p) => s + Number(p.valor), 0);
  el.innerHTML = `
    ${pix && abertos.length ? `<div class="card accent" style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
      <div><span class="lbl" style="display:block;color:var(--dim);margin-bottom:6px">Pague com PIX</span><b style="font-size:16px">${esc(pix)}</b></div>
      <button class="btn btn-sm" id="cp-pix">${ICON.copy}Copiar chave</button></div>` : ''}
    <h3 class="section-h">Em aberto${abertos.length ? ` · ${dinheiro(total)}` : ''}</h3>
    ${abertos.length ? `<div class="list">${abertos.map(linha).join('')}</div>` : '<div class="empty-state"><b>Nenhum pagamento em aberto</b>Está tudo em dia por aqui.</div>'}
    ${pagos.length ? `<h3 class="section-h">Histórico</h3><div class="list">${pagos.slice(0, 24).map(linha).join('')}</div>` : ''}`;
  $('#cp-pix')?.addEventListener('click', () => copiar(pix));
}

/* ---------- Indicações ---------- */
function abaIndicacoes() {
  const el = $('#aba'), cod = S.perfil.codigo_indicacao || '';
  const msg = `Oi! Trabalho com a MLX Mind (marketing, tráfego pago e sites) e recomendo demais. Se quiser conversar com eles, fala que foi indicação minha: código ${cod}. https://mlxmind.com.br`;
  el.innerHTML = `
    <div class="ref-grid">
      <div class="card accent">
        <h3>Indique e ganhe desconto</h3>
        <p>${esc(S.config.desconto_indicacao || '')}</p>
        <div class="code-box"><div><span class="lbl" style="display:block;color:var(--dim);margin-bottom:4px">Seu código</span><code>${esc(cod)}</code></div>
          <button class="btn btn-sm" id="cp-cod">${ICON.copy}Copiar</button></div>
        <div class="form-actions">
          <a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">${ICON.wa}Compartilhar no WhatsApp</a>
          <button class="btn btn-sm" id="cp-msg">${ICON.copy}Copiar mensagem</button>
        </div>
        ${S.config.regras_indicacao ? `<p style="margin-top:18px;font-size:13px">${esc(S.config.regras_indicacao)}</p>` : ''}
      </div>
      <div class="card">
        <h3>Indicar alguém agora</h3>
        <p style="margin-bottom:16px">Passe o contato e a MLX entra em contato falando que foi você quem indicou.</p>
        <form id="f-ind" novalidate>
          <div class="field"><label for="i-nome">Nome da pessoa ou empresa</label><input id="i-nome" required maxlength="120"></div>
          <div class="field"><label for="i-cont">WhatsApp ou Instagram</label><input id="i-cont" maxlength="120" placeholder="(16) 99999-9999 ou @empresa"></div>
          <div class="field"><label for="i-obs">Alguma observação? (opcional)</label><textarea id="i-obs" maxlength="500" placeholder="Ex.: tem uma clínica e quer mais pacientes"></textarea></div>
          <div id="i-msg" class="form-msg err" hidden></div>
          <button class="btn btn-primary" type="submit">Enviar indicação</button>
        </form>
      </div>
    </div>
    <h3 class="section-h" style="margin-top:32px">Suas indicações</h3>
    ${S.inds.length ? `<div class="list">${S.inds.map(i => `
      <div class="row">
        <div><h4>${esc(i.nome_indicado)}</h4><div class="sub">Indicado em ${dataBR(i.criado_em.slice(0, 10))}${i.contato ? ` · ${esc(i.contato)}` : ''}</div></div>
        <div class="right">${i.status === 'fechou' && Number(i.desconto_valor) > 0 ? `<span class="val">-${dinheiro(i.desconto_valor)}</span>` : ''}
          ${i.status === 'fechou' && Number(i.desconto_valor) > 0 ? badge(i.desconto_aplicado ? ['Desconto aplicado', 'b-purple'] : ['Desconto a receber', 'b-ok']) : ''}
          ${badge(STATUS_IND[i.status])}</div>
      </div>`).join('')}</div>` : '<div class="empty-state"><b>Nenhuma indicação ainda</b>Compartilhe seu código ou indique alguém pelo formulário acima.</div>'}`;

  $('#cp-cod').onclick = () => copiar(cod);
  $('#cp-msg').onclick = () => copiar(msg);
  $('#f-ind').onsubmit = async e => {
    e.preventDefault();
    const nome = $('#i-nome').value.trim(), contato = $('#i-cont').value.trim(), obs = $('#i-obs').value.trim(), m = $('#i-msg');
    if (nome.length < 2) { m.textContent = 'Informe o nome de quem você está indicando.'; m.hidden = false; return; }
    if (!contato) { m.textContent = 'Passe um WhatsApp ou Instagram para a gente entrar em contato.'; m.hidden = false; return; }
    const btn = e.submitter; btn.disabled = true;
    const { data, error } = await sb.from('indicacoes')
      .insert({ cliente_id: S.perfil.id, nome_indicado: nome, contato, observacao: obs || null })
      .select().single();
    btn.disabled = false;
    if (error) { m.textContent = erroAmigavel(error); m.hidden = false; return; }
    S.inds.unshift(data);
    toast('Indicação enviada! Obrigado 💜');
    abaIndicacoes();
  };
}
