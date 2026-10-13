/* =========================================================
   MLX Mind · blocos de tela usados na área do cliente e no admin
   ========================================================= */
import {
  sb, $, $$, esc, dinheiro, parseData, isoData, hoje, dataBR, diaSemana, STATUS_POST, badge, galeria,
  toast, erroAmigavel, copiar, mesISO, addMeses, mesNome, mesCurto, cap, num, compacto, variacao,
  METRICAS, STATUS_LEAD, grafico, abrirModal, ICON, ICON2
} from './comum.js';

/* ---------- Postagem (card) ---------- */
export function cardPost(p, url, { acoes = true } = {}) {
  const futuro = p.data_publicacao >= isoData(hoje());
  let botoes = '';
  if (acoes) {
    if (p.status === 'aguardando_aprovacao') botoes = `<button class="btn btn-ok btn-sm" data-aprovar="${p.id}">Aprovar</button><button class="btn btn-sm" data-ajuste="${p.id}">Pedir ajuste</button>`;
    else if (p.status === 'ajuste_solicitado') botoes = `<button class="btn btn-ok btn-sm" data-aprovar="${p.id}">Aprovar assim mesmo</button><button class="btn btn-sm" data-ajuste="${p.id}">Editar pedido</button>`;
    else if (p.status === 'aprovado' && futuro) botoes = `<button class="btn btn-ghost btn-sm" data-ajuste="${p.id}">Pedir ajuste</button>`;
  }
  const longa = (p.legenda || '').length > 180;
  const quem = p.respondido_por_nome && ['aprovado', 'ajuste_solicitado'].includes(p.status)
    ? `<div class="quem">${p.status === 'aprovado' ? 'Aprovado' : 'Ajuste pedido'} por <b>${esc(p.respondido_por_nome)}</b> em ${dataBR(p.respondido_em?.slice(0, 10))}</div>` : '';
  return `
  <article class="post">
    ${galeria(p.midias, url, `<span class="chip">${esc(p.formato)}</span>`)}
    <div class="post-body">
      <div class="post-meta"><span>${esc(diaSemana(p.data_publicacao))}${p.horario ? ' · ' + esc(p.horario.slice(0, 5)) : ''} · ${esc(p.rede)}</span>${badge(STATUS_POST[p.status])}</div>
      <h3>${esc(p.titulo)}</h3>
      ${p.legenda ? `<p class="caption">${esc(p.legenda)}</p>${longa ? '<button class="link" data-mais>ver mais</button>' : ''}` : ''}
      ${p.status === 'ajuste_solicitado' && p.comentario_cliente ? `<div class="note"><b>Pedido de ajuste:</b> ${esc(p.comentario_cliente)}</div>` : ''}
      ${quem}
      ${botoes ? `<div class="post-actions">${botoes}</div>` : ''}
    </div>
  </article>`;
}
export function ligarLegendas(el) {
  $$('[data-mais]', el).forEach(b => b.onclick = () => {
    const c = b.previousElementSibling; c.classList.toggle('open'); b.textContent = c.classList.contains('open') ? 'ver menos' : 'ver mais';
  });
}

/* ---------- Calendário do mês ---------- */
export function calendarioMes(posts, mesIso) {
  const ini = parseData(mesIso), ano = ini.getFullYear(), mes = ini.getMonth();
  const offset = (ini.getDay() + 6) % 7, dias = new Date(ano, mes + 1, 0).getDate();
  const porDia = {};
  posts.forEach(p => { (porDia[p.data_publicacao] ||= []).push(p); });
  const hojeIso = isoData(hoje());
  let cel = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(d => `<div class="cal-h">${d}</div>`).join('');
  for (let i = 0; i < offset; i++) cel += '<div class="cal-d vazio"></div>';
  for (let d = 1; d <= dias; d++) {
    const iso = isoData(new Date(ano, mes, d)), lista = porDia[iso] || [];
    cel += `<div class="cal-d${iso === hojeIso ? ' hoje' : ''}${lista.length ? ' tem' : ''}" data-dia="${iso}"><span class="n">${d}</span>
      ${lista.map(p => `<button class="cal-p ${STATUS_POST[p.status][1]}" data-post="${p.id}" title="${esc(p.titulo)}">${esc(p.titulo)}</button>`).join('')}</div>`;
  }
  return `<div class="cal">${cel}</div>`;
}

/* ---------- Resultados (métricas por rede + metas) ---------- */
export function vistaResultados(el, { conta, metricas, metas, mes, aoMudarMes, admin = false }) {
  const meses = [...new Set([...metricas.map(m => m.mes), ...metas.map(m => m.mes), mesISO()])].sort().reverse();
  const doMes = metricas.filter(m => m.mes === mes);
  const ant = addMeses(mes, -1);
  const doAnt = r => metricas.find(m => m.mes === ant && m.rede === r);
  const soma = (lista, k) => { const v = lista.map(m => m[k]).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + Number(b), 0) : null; };
  const leads = soma(doMes, 'leads'), leadsAnt = soma(metricas.filter(m => m.mes === ant), 'leads');
  const inv = soma(doMes, 'investimento'), invAnt = soma(metricas.filter(m => m.mes === ant), 'investimento');
  const msgs = soma(doMes, 'mensagens'), msgsAnt = soma(metricas.filter(m => m.mes === ant), 'mensagens');
  const alc = soma(doMes, 'alcance'), alcAnt = soma(metricas.filter(m => m.mes === ant), 'alcance');
  const cpl = inv && leads ? inv / leads : null, cplAnt = invAnt && leadsAnt ? invAnt / leadsAnt : null;
  const metasMes = metas.filter(m => m.mes === mes);

  const kpi = (t, v, a, fmt = compacto, inv2 = false) => {
    const va = variacao(v, a, inv2);
    return `<div class="kpi"><span class="lbl">${t}</span><strong>${v === null ? '—' : esc(fmt(v))}</strong>${va ? `<small class="var ${va.cls}">${va.txt} vs ${esc(mesCurto(ant))}</small>` : '<small class="var">&nbsp;</small>'}</div>`;
  };

  const cards = doMes.length ? doMes.sort((a, b) => conta.redes.indexOf(a.rede) - conta.redes.indexOf(b.rede)).map(m => {
    const a = doAnt(m.rede);
    const principal = m.seguidores !== null ? 'seguidores' : METRICAS.find(x => m[x.k] !== null)?.k;
    const def = METRICAS.find(x => x.k === principal);
    const vp = principal ? variacao(m[principal], a?.[principal]) : null;
    const difSeg = principal === 'seguidores' && a?.seguidores !== null && a?.seguidores !== undefined ? m.seguidores - a.seguidores : null;
    const linhas = METRICAS.filter(x => x.k !== principal && m[x.k] !== null && m[x.k] !== undefined).map(x => {
      const v = variacao(m[x.k], a?.[x.k], x.k === 'investimento' ? 'neutro' : false);
      return `<li><span>${x.t}</span><b>${x.dinheiro ? dinheiro(m[x.k]) : num(m[x.k])}</b>${v ? `<i class="var ${v.cls}">${v.txt}</i>` : '<i></i>'}</li>`;
    }).join('');
    return `<button class="rede-card" data-rede="${esc(m.rede)}">
      <div class="rede-top"><span class="rede-nome">${esc(m.rede)}</span><span class="link-like">Ver evolução →</span></div>
      ${principal ? `<span class="lbl">${def.t}</span><strong class="big">${def.dinheiro ? dinheiro(m[principal]) : num(m[principal])}</strong>
        ${difSeg !== null ? `<small class="var ${difSeg >= 0 ? 'up' : 'down'}">${difSeg >= 0 ? '+' : ''}${num(difSeg)} no mês${vp ? ` (${vp.txt})` : ''}</small>` : vp ? `<small class="var ${vp.cls}">${vp.txt}</small>` : ''}` : ''}
      ${linhas ? `<ul class="rede-lista">${linhas}</ul>` : ''}
    </button>`;
  }).join('') : '';

  el.innerHTML = `
    <div class="week-nav">
      <div><span class="lbl" style="display:block;margin-bottom:4px;color:var(--dim)">Resultados de</span><h2>${esc(cap(mesNome(mes)))}</h2></div>
      <div class="ctrls"><select class="sel-sm" id="r-mes" aria-label="Mês">${meses.map(m => `<option value="${m}"${m === mes ? ' selected' : ''}>${esc(cap(mesNome(m)))}</option>`).join('')}</select></div>
    </div>
    ${doMes.length || metasMes.length ? `
      <div class="kpis">
        ${kpi('Alcance total', alc, alcAnt)}
        ${kpi('Mensagens', msgs, msgsAnt)}
        ${kpi('Leads', leads, leadsAnt, num)}
        ${inv !== null ? kpi('Investido em anúncios', inv, invAnt, dinheiro, 'neutro') : ''}
        ${cpl !== null ? kpi('Custo por lead', cpl, cplAnt, dinheiro, true) : ''}
      </div>
      ${metasMes.length ? `<h3 class="section-h">Metas do mês</h3><div class="metas">${metasMes.map(blocoMeta).join('')}</div>` : ''}
      ${cards ? `<h3 class="section-h">Por rede</h3><div class="redes">${cards}</div>` : ''}`
    : `<div class="empty-state"><b>Ainda não há resultados de ${esc(mesNome(mes))}</b>${admin ? 'Lance os números do mês no formulário acima.' : 'A MLX lança os números do mês aqui. Enquanto isso, veja os meses anteriores.'}</div>`}`;

  $('#r-mes', el).onchange = e => aoMudarMes(e.target.value);
  $$('[data-rede]', el).forEach(b => b.onclick = () => evolucaoRede(b.dataset.rede, metricas, mes));
}

export function blocoMeta(m) {
  const pct = Math.min(100, Math.round(Number(m.atual) / Number(m.alvo) * 100));
  const fmtv = v => m.unidade === 'R$' ? dinheiro(v) : num(v) + (m.unidade ? ' ' + esc(m.unidade) : '');
  return `<div class="meta${pct >= 100 ? ' ok' : ''}" data-meta="${m.id}">
    <div class="meta-top"><b>${esc(m.titulo)}</b><span>${pct}%</span></div>
    <div class="barra"><i style="width:${pct}%"></i></div>
    <small>${fmtv(m.atual)} de ${fmtv(m.alvo)}${pct >= 100 ? ' · meta batida! 🎉' : ''}</small>
  </div>`;
}

function evolucaoRede(rede, metricas, mes) {
  const meses = Array.from({ length: 6 }, (_, i) => addMeses(mes, i - 5));
  const linhas = meses.map(m => metricas.find(x => x.mes === m && x.rede === rede) || null);
  const defs = METRICAS.filter(d => linhas.some(l => l && l[d.k] !== null && l[d.k] !== undefined));
  const dlg = $('#dlg');
  abrirModal(dlg, `<h2>${esc(rede)}</h2><p class="dsub">Evolução dos últimos 6 meses</p>
    <div class="evol">${defs.map(d => `<div class="evol-item"><span class="lbl">${d.t}</span>
      ${grafico(meses.map((m, i) => ({ r: mesCurto(m), v: linhas[i]?.[d.k] ?? null })), { tipo: d.k === 'seguidores' ? 'linha' : 'barras', fmt: d.dinheiro ? (v => 'R$ ' + compacto(v)) : compacto })}</div>`).join('')}</div>`);
  dlg.classList.add('largo');
  dlg.addEventListener('close', () => dlg.classList.remove('largo'), { once: true });
}

/* ---------- Cofre de acessos ---------- */
export function blocoAcessos(el, { contaId, acessos, aoMudar }) {
  el.innerHTML = `
    <div class="aviso-seg">${ICON2.lock}<div><b>Senhas guardadas com criptografia.</b> Só quem tem acesso completo vê, e cada visualização fica registrada no histórico.
      Para Instagram e Facebook, o mais seguro é dar acesso à MLX pelo <b>Gerenciador de Negócios da Meta</b> (sem compartilhar senha).</div></div>
    <div class="panel-h" style="margin:18px 0 12px"><h3 style="margin:0">Acessos (${acessos.length})</h3><button class="btn btn-sm btn-primary" id="ac-novo">${ICON.plus}Adicionar acesso</button></div>
    ${acessos.length ? `<div class="acessos">${acessos.map(a => `
      <div class="acesso" data-ac="${a.id}">
        <div class="ac-top"><b>${esc(a.rede)}</b>${a.link ? `<a class="link" href="${esc(a.link)}" target="_blank" rel="noopener">abrir</a>` : ''}</div>
        <div class="ac-linha"><span class="lbl">Login</span><code>${esc(a.login || '—')}</code>${a.login ? `<button class="icon-btn sm" data-cp-login title="Copiar login" aria-label="Copiar login">${ICON.copy}</button>` : ''}</div>
        <div class="ac-linha"><span class="lbl">Senha</span><code data-senha>${a.tem_senha ? '••••••••' : '—'}</code>
          ${a.tem_senha ? `<button class="icon-btn sm" data-ver title="Mostrar senha" aria-label="Mostrar senha">${ICON2.eye}</button><button class="icon-btn sm" data-cp-senha title="Copiar senha" aria-label="Copiar senha">${ICON.copy}</button>` : ''}</div>
        ${a.observacao ? `<p class="ac-obs">${esc(a.observacao)}</p>` : ''}
        <div class="ac-rodape"><small>Atualizado ${a.atualizado_por_nome ? 'por ' + esc(a.atualizado_por_nome) + ' ' : ''}em ${dataBR(a.atualizado_em.slice(0, 10))}</small>
          <span><button class="btn btn-sm btn-ghost" data-edit>Editar</button><button class="btn btn-sm btn-ghost" data-rm>Remover</button></span></div>
      </div>`).join('')}</div>` : '<div class="empty-state"><b>Nenhum acesso guardado</b>Adicione os logins das redes sociais para a MLX conseguir trabalhar.</div>'}`;

  const revelar = async (id) => {
    const { data, error } = await sb.rpc('revelar_senha', { p_id: id });
    if (error) { toast(erroAmigavel(error), true); return null; }
    return data;
  };
  $$('[data-ac]', el).forEach(c => {
    const a = acessos.find(x => x.id === c.dataset.ac);
    $('[data-cp-login]', c)?.addEventListener('click', () => copiar(a.login));
    $('[data-ver]', c)?.addEventListener('click', async () => {
      const alvo = $('[data-senha]', c);
      if (alvo.dataset.aberta) { alvo.textContent = '••••••••'; delete alvo.dataset.aberta; return; }
      const s = await revelar(a.id); if (s === null) return;
      alvo.textContent = s || '(vazia)'; alvo.dataset.aberta = '1';
      setTimeout(() => { if (alvo.dataset.aberta) { alvo.textContent = '••••••••'; delete alvo.dataset.aberta; } }, 30000);
    });
    $('[data-cp-senha]', c)?.addEventListener('click', async () => { const s = await revelar(a.id); if (s) copiar(s); });
    $('[data-edit]', c).onclick = () => formAcesso(contaId, a, aoMudar);
    $('[data-rm]', c).onclick = async () => {
      if (!confirm(`Remover o acesso de ${a.rede}? A senha será apagada do cofre.`)) return;
      const { error } = await sb.rpc('remover_acesso', { p_id: a.id });
      if (error) return toast(erroAmigavel(error), true);
      toast('Acesso removido.'); aoMudar();
    };
  });
  $('#ac-novo', el).onclick = () => formAcesso(contaId, null, aoMudar);
}

function formAcesso(contaId, a, aoMudar) {
  const dlg = $('#dlg');
  abrirModal(dlg, `<h2>${a ? 'Editar acesso' : 'Adicionar acesso'}</h2>
    <p class="dsub">A senha é criptografada antes de ser guardada.</p>
    <form id="f-ac" novalidate>
      <div class="field"><label for="ac-rede">Rede / serviço</label><input id="ac-rede" list="ac-redes" maxlength="60" value="${esc(a?.rede || '')}" placeholder="Instagram">
        <datalist id="ac-redes">${['Instagram', 'Facebook', 'TikTok', 'YouTube', 'LinkedIn', 'Google Meu Negócio', 'Gerenciador de Anúncios', 'Site / hospedagem', 'E-mail'].map(r => `<option value="${r}">`).join('')}</datalist></div>
      <div class="field"><label for="ac-login">Login (e-mail, usuário ou telefone)</label><input id="ac-login" maxlength="200" autocomplete="off" value="${esc(a?.login || '')}"></div>
      <div class="field"><label for="ac-senha">${a?.tem_senha ? 'Nova senha (deixe em branco para manter a atual)' : 'Senha'}</label><input id="ac-senha" type="password" autocomplete="new-password" maxlength="200"></div>
      <div class="field"><label for="ac-link">Link (opcional)</label><input id="ac-link" type="url" maxlength="300" value="${esc(a?.link || '')}" placeholder="https://instagram.com/…"></div>
      <div class="field"><label for="ac-obs">Observação (opcional)</label><input id="ac-obs" maxlength="500" value="${esc(a?.observacao || '')}" placeholder="Ex.: código de verificação vai pro WhatsApp do Miguel"></div>
      <div id="ac-msg" class="form-msg err" hidden></div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar</button><button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div>
    </form>`, d => {
    $$('[data-fechar]', d).forEach(b => b.onclick = () => d.close());
    $('#f-ac', d).onsubmit = async e => {
      e.preventDefault();
      const m = $('#ac-msg', d), rede = $('#ac-rede', d).value.trim(), link = $('#ac-link', d).value.trim();
      if (!rede) { m.textContent = 'Informe a rede.'; m.hidden = false; return; }
      if (link && !/^https?:\/\//i.test(link)) { m.textContent = 'O link precisa começar com https://'; m.hidden = false; return; }
      const { error } = await sb.rpc('salvar_acesso', {
        p_id: a?.id ?? null, p_conta: contaId, p_rede: rede, p_login: $('#ac-login', d).value.trim(),
        p_senha: $('#ac-senha', d).value || null, p_link: link || null, p_obs: $('#ac-obs', d).value.trim() || null
      });
      if (error) { m.textContent = erroAmigavel(error); m.hidden = false; return; }
      d.close(); toast('Acesso salvo com segurança.'); aoMudar();
    };
  });
}

/* ---------- Histórico ---------- */
export function listaAtividades(itens, vazio = 'Nada por aqui ainda.') {
  if (!itens.length) return `<div class="empty-state">${vazio}</div>`;
  let dia = '';
  return `<div class="hist">${itens.map(a => {
    const d = a.criado_em.slice(0, 10); const cab = d !== dia ? `<div class="hist-dia">${esc(cap(dataBR(d, { weekday: 'long', day: '2-digit', month: 'long' })))}</div>` : ''; dia = d;
    const hora = new Date(a.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${cab}<div class="hist-item"><span class="hist-av${a.ator_mlx ? ' mlx' : ''}">${a.ator_mlx ? 'MLX' : esc((a.ator_nome || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase())}</span>
      <p><b>${esc(a.ator_nome || 'Sistema')}</b> ${esc(a.acao)}${a.alvo ? ` <span class="alvo">${esc(a.alvo)}</span>` : ''}</p><time>${hora}</time></div>`;
  }).join('')}</div>`;
}

/* ---------- Leads ---------- */
export function resumoLeads(leads) {
  const total = leads.length, fech = leads.filter(l => l.status === 'fechou');
  const valor = fech.reduce((s, l) => s + Number(l.valor || 0), 0);
  const conv = total ? Math.round(fech.length / total * 100) : 0;
  return `<div class="kpis">
    <div class="kpi"><span class="lbl">Leads no mês</span><strong>${num(total)}</strong></div>
    <div class="kpi"><span class="lbl">Fecharam</span><strong>${num(fech.length)}</strong><small class="var">${conv}% de conversão</small></div>
    <div class="kpi"><span class="lbl">Em andamento</span><strong>${num(leads.filter(l => ['novo', 'em_atendimento', 'proposta'].includes(l.status)).length)}</strong></div>
    <div class="kpi"><span class="lbl">Vendido</span><strong>${valor ? dinheiro(valor) : '—'}</strong></div>
  </div>`;
}
export function linhaLead(l, admin = false) {
  return `<div class="row" data-lead="${l.id}">
    <div><h4>${esc(l.nome)}</h4><div class="sub">${dataBR(l.data)} · ${esc(l.origem)}${l.contato ? ' · ' + esc(l.contato) : ''}${l.observacao ? `<br>${esc(l.observacao)}` : ''}</div></div>
    <div class="right">${l.valor ? `<span class="val">${dinheiro(l.valor)}</span>` : ''}${badge(STATUS_LEAD[l.status])}
      ${admin ? '<button class="btn btn-sm" data-ed-lead>Editar</button><button class="btn btn-sm btn-danger" data-del-lead>Excluir</button>' : ''}</div>
  </div>`;
}
