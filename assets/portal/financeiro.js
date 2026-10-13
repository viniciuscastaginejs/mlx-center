/* =========================================================
   MLX Mind · Financeiro da MLX (só equipe)
   - A receber: mensalidades dos clientes (as mesmas que o cliente vê) + receitas avulsas
   - A pagar: comissões de parceiros (automáticas), ferramentas, anúncios, impostos…
   ========================================================= */
import {
  sb, $, $$, esc, dinheiro, parseData, isoData, hoje, dataBR, statusPagamento, badge, toast, erroAmigavel,
  copiar, mesISO, addMeses, mesNome, mesCurto, cap, abrirModal, ICON, ICON2
} from './comum.js';

export const CAT_DESP = ['Comissão de parceiro', 'Anúncios (verba)', 'Ferramentas e softwares', 'Freelancers', 'Salários e pró-labore', 'Impostos e taxas', 'Equipamentos', 'Escritório e contas', 'Marketing da MLX', 'Outros'];
export const CAT_REC = ['Mensalidade', 'Serviço avulso', 'Site / projeto', 'Consultoria', 'Outros'];
const FORMAS = ['PIX', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro'];

const F = { aba: 'resumo', mes: mesISO(), filtro: 'todos', pags: [], lancs: [], parceiros: [], vinc: [], ctx: null };

function parseValor(txt) {
  let t = String(txt || '').trim().replace(/[^\d,.-]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return Number(t);
}
const vBR = v => (v === null || v === undefined || v === '') ? '' : String(v).replace('.', ',');
const hojeIso = () => isoData(hoje());
const atrasado = i => i.status === 'pendente' && i.vencimento < hojeIso();

async function carregar() {
  const r = await Promise.all([
    sb.from('pagamentos').select('*').order('vencimento'),
    sb.from('lancamentos').select('*').order('vencimento'),
    sb.from('parceiros').select('*').order('nome'),
    sb.from('conta_parceiro').select('*')
  ]);
  const erro = r.find(x => x.error); if (erro) toast(erroAmigavel(erro.error), true);
  [F.pags, F.lancs, F.parceiros, F.vinc] = r.map(x => x.data || []);
}

// receitas = mensalidades dos clientes + receitas avulsas
function receitas() {
  return [
    ...F.pags.map(p => ({ ...p, origem: 'cliente', categoria: 'Mensalidade', forma: p.forma_pagamento })),
    ...F.lancs.filter(l => l.tipo === 'receita').map(l => ({ ...l, origem: 'avulsa', forma: l.forma_pagamento }))
  ];
}
const despesas = () => F.lancs.filter(l => l.tipo === 'despesa').map(l => ({ ...l, origem: 'despesa', forma: l.forma_pagamento }));
const doMes = (lista, mes) => lista.filter(i => i.vencimento >= mes && i.vencimento < addMeses(mes, 1));
const soma = (lista, fn = () => true) => lista.filter(i => i.status !== 'cancelado' && fn(i)).reduce((s, i) => s + Number(i.valor), 0);
const nomeParceiro = id => F.parceiros.find(p => p.id === id)?.nome || '';

/* ---------- ponto de entrada ---------- */
export async function vistaFinanceiro(main, ctx) {
  F.ctx = ctx;
  main.innerHTML = '<div class="loading"><div><div class="spin"></div>Carregando financeiro…</div></div>';
  await carregar();
  desenhar();
}
function desenhar() {
  const { main, barraMobile, ligarVoltar } = F.ctx;
  const atrRec = receitas().filter(atrasado), atrPag = despesas().filter(atrasado);
  main.innerHTML = `${barraMobile()}
    <div class="main-head"><div><h1>Financeiro MLX</h1><p>Só a equipe vê. Mensalidades marcadas aqui aparecem do mesmo jeito para o cliente.</p></div>
      <div class="form-actions"><button class="btn btn-sm btn-primary" id="f-nova-rec">${ICON.plus}Receita</button><button class="btn btn-sm" id="f-nova-desp">${ICON.plus}Despesa</button></div></div>
    <div class="tabs" role="tablist">
      ${[['resumo', 'Resumo'], ['receber', 'A receber', atrRec.length], ['pagar', 'A pagar', atrPag.length], ['parceiros', 'Parceiros']].map(([k, t, n]) =>
        `<button class="tab" role="tab" data-faba="${k}" aria-selected="${F.aba === k}">${t}${n ? ` <span class="count alerta">${n}</span>` : ''}</button>`).join('')}
    </div>
    ${F.aba !== 'parceiros' ? `<div class="week-nav"><div><span class="lbl" style="display:block;margin-bottom:4px;color:var(--dim)">Mês</span><h2>${esc(cap(mesNome(F.mes)))}</h2></div>
      <div class="ctrls">${F.mes !== mesISO() ? '<button class="btn btn-sm" id="f-hoje">Este mês</button>' : ''}<button class="icon-btn" id="f-ant" aria-label="Mês anterior">${ICON.prev}</button><button class="icon-btn" id="f-prox" aria-label="Próximo mês">${ICON.next}</button></div></div>` : ''}
    <div id="faba"></div>`;
  ligarVoltar();
  $$('[data-faba]', main).forEach(b => b.onclick = () => { F.aba = b.dataset.faba; F.filtro = 'todos'; desenhar(); });
  $('#f-ant')?.addEventListener('click', () => { F.mes = addMeses(F.mes, -1); desenhar(); });
  $('#f-prox')?.addEventListener('click', () => { F.mes = addMeses(F.mes, 1); desenhar(); });
  $('#f-hoje')?.addEventListener('click', () => { F.mes = mesISO(); desenhar(); });
  $('#f-nova-rec').onclick = () => formReceita(null);
  $('#f-nova-desp').onclick = () => formDespesa(null);
  ({ resumo, receber, pagar, parceiros })[F.aba]();
}
async function recarregar(msg) { if (msg) toast(msg); await carregar(); desenhar(); }

/* ---------- Resumo ---------- */
function resumo() {
  const el = $('#faba'), rec = doMes(receitas(), F.mes), desp = doMes(despesas(), F.mes);
  const prevRec = soma(rec), recebido = soma(rec, i => i.status === 'pago');
  const prevPag = soma(desp), pago = soma(desp, i => i.status === 'pago');
  const atrRec = receitas().filter(atrasado), atrPag = despesas().filter(atrasado);
  const meses = Array.from({ length: 6 }, (_, i) => addMeses(F.mes, i - 5));
  const serie = meses.map(m => ({ r: mesCurto(m), a: soma(doMes(receitas(), m), i => i.status === 'pago'), b: soma(doMes(despesas(), m), i => i.status === 'pago') }));
  const porCat = {}; desp.filter(i => i.status !== 'cancelado').forEach(i => { porCat[i.categoria] = (porCat[i.categoria] || 0) + Number(i.valor); });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]), maxCat = cats[0]?.[1] || 1;
  const porCli = {}; rec.filter(i => i.status !== 'cancelado').forEach(i => { const k = i.conta_id ? F.ctx.nomeConta(i.conta_id) : i.descricao; porCli[k] = (porCli[k] || 0) + Number(i.valor); });
  const clis = Object.entries(porCli).sort((a, b) => b[1] - a[1]).slice(0, 6), maxCli = clis[0]?.[1] || 1;
  const comPend = {}; despesas().filter(i => i.categoria === 'Comissão de parceiro' && i.status === 'pendente').forEach(i => { const k = nomeParceiro(i.parceiro_id) || 'Sem parceiro'; comPend[k] = (comPend[k] || 0) + Number(i.valor); });

  el.innerHTML = `
    <div class="kpis fin">
      <div class="kpi"><span class="lbl">A receber no mês</span><strong>${dinheiro(prevRec)}</strong><small class="var up">${dinheiro(recebido)} já recebido</small></div>
      <div class="kpi"><span class="lbl">A pagar no mês</span><strong>${dinheiro(prevPag)}</strong><small class="var">${dinheiro(pago)} já pago</small></div>
      <div class="kpi"><span class="lbl">Saldo previsto</span><strong class="${prevRec - prevPag < 0 ? 'neg' : ''}">${dinheiro(prevRec - prevPag)}</strong><small class="var">se tudo for pago</small></div>
      <div class="kpi"><span class="lbl">Saldo realizado</span><strong class="${recebido - pago < 0 ? 'neg' : ''}">${dinheiro(recebido - pago)}</strong><small class="var">recebido − pago</small></div>
    </div>
    ${atrRec.length || atrPag.length ? `<div class="alert" style="margin-top:14px"><span>${atrRec.length ? `<b>${dinheiro(soma(atrRec))}</b> atrasado para receber (${atrRec.length})` : ''}${atrRec.length && atrPag.length ? ' · ' : ''}${atrPag.length ? `<b>${dinheiro(soma(atrPag))}</b> atrasado para pagar (${atrPag.length})` : ''}</span>
      <span class="form-actions" style="margin:0">${atrRec.length ? '<button class="btn btn-sm" data-ir="receber">Ver a receber</button>' : ''}${atrPag.length ? '<button class="btn btn-sm" data-ir="pagar">Ver a pagar</button>' : ''}</span></div>` : ''}
    <div class="fin-grid">
      <div class="panel"><h3>Recebido x pago · 6 meses</h3>${graficoDuplo(serie)}
        <div class="legenda-fin"><span><i class="cor-a"></i>Recebido</span><span><i class="cor-b"></i>Pago</span></div></div>
      <div class="panel"><h3>Despesas de ${esc(mesNome(F.mes))}</h3>
        ${cats.length ? cats.map(([c, v]) => `<div class="hbar"><span>${esc(c)}</span><div class="barra"><i style="width:${Math.round(v / maxCat * 100)}%"></i></div><b>${dinheiro(v)}</b></div>`).join('') : '<p class="vazio-txt">Nenhuma despesa lançada neste mês.</p>'}</div>
      <div class="panel"><h3>Receita por cliente</h3>
        ${clis.length ? clis.map(([c, v]) => `<div class="hbar"><span>${esc(c)}</span><div class="barra verde"><i style="width:${Math.round(v / maxCli * 100)}%"></i></div><b>${dinheiro(v)}</b></div>`).join('') : '<p class="vazio-txt">Nenhuma receita neste mês.</p>'}</div>
      <div class="panel"><h3>Comissões a pagar</h3>
        ${Object.keys(comPend).length ? Object.entries(comPend).map(([p, v]) => `<div class="hbar"><span>${esc(p)}</span><span></span><b>${dinheiro(v)}</b></div>`).join('') + '<button class="btn btn-sm" data-ir="parceiros" style="margin-top:12px">Ver parceiros</button>' : '<p class="vazio-txt">Nenhuma comissão pendente.</p>'}</div>
    </div>
    <div class="form-actions" style="margin-top:6px"><button class="btn btn-sm" id="f-csv">${ICON2.down}Exportar ${esc(mesNome(F.mes))} (planilha CSV)</button></div>`;
  $$('[data-ir]', el).forEach(b => b.onclick = () => { F.aba = b.dataset.ir; F.filtro = b.dataset.ir === 'parceiros' ? 'todos' : 'atrasados'; desenhar(); });
  $('#f-csv').onclick = exportarCSV;
}

function graficoDuplo(serie) {
  const W = 600, H = 210, pt = 28, pb = 26, pl = 6, pr = 6, n = serie.length, larg = (W - pl - pr) / n;
  const mx = Math.max(1, ...serie.flatMap(s => [s.a, s.b])) * 1.15;
  const y = v => pt + (H - pt - pb) * (1 - v / mx);
  const curto = v => v >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : Math.round(v);
  const barras = serie.map((s, i) => {
    const x = pl + larg * i, w = larg * 0.3;
    return `<rect x="${x + larg * 0.17}" y="${y(s.a)}" width="${w}" height="${H - pb - y(s.a)}" rx="5" fill="#4ade80"/>
      <rect x="${x + larg * 0.53}" y="${y(s.b)}" width="${w}" height="${H - pb - y(s.b)}" rx="5" fill="#b65eff"/>
      ${s.a ? `<text x="${x + larg * 0.17 + w / 2}" y="${y(s.a) - 6}" text-anchor="middle" font-size="11" fill="#bbf7d0">${curto(s.a)}</text>` : ''}
      ${s.b ? `<text x="${x + larg * 0.53 + w / 2}" y="${y(s.b) - 6}" text-anchor="middle" font-size="11" fill="#e4c6ff">${curto(s.b)}</text>` : ''}
      <text x="${x + larg / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#8f849b">${esc(s.r)}</text>`;
  }).join('');
  return `<svg class="graf" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="#ffffff14"/>${barras}</svg>`;
}

/* ---------- listas ---------- */
const FILTROS = [['todos', 'Todos'], ['aberto', 'Em aberto'], ['atrasados', 'Atrasados'], ['pagos', 'Pagos']];
function filtrar(lista) {
  if (F.filtro === 'atrasados') return lista.filter(atrasado).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const m = doMes(lista, F.mes).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  if (F.filtro === 'aberto') return m.filter(i => i.status === 'pendente');
  if (F.filtro === 'pagos') return m.filter(i => i.status === 'pago');
  return m;
}
function barraFiltros(lista, total) {
  return `<div class="panel-h fin-filtros"><div class="seg seg-scroll" role="group" aria-label="Filtro">${FILTROS.map(([k, t]) => `<button type="button" data-filtro="${k}" aria-pressed="${F.filtro === k}">${t}</button>`).join('')}</div>
    <span class="fin-total">${lista.length} lançamento${lista.length === 1 ? '' : 's'} · <b>${dinheiro(total)}</b></span></div>`;
}
function linhaFin(i, tipo) {
  const quem = i.conta_id ? F.ctx.nomeConta(i.conta_id) : (i.parceiro_id ? nomeParceiro(i.parceiro_id) : '');
  const st = i.status === 'pago' ? [tipo === 'rec' ? 'Recebido' : 'Pago', 'b-ok'] : statusPagamento(i);
  return `<div class="row fin-row${i.status === 'cancelado' ? ' cancel' : ''}" data-fin="${i.origem}:${i.id}">
    <div><h4>${esc(i.descricao)}</h4>
      <div class="sub">${quem ? `<b>${esc(quem)}</b> · ` : ''}${esc(i.categoria)} · vence ${dataBR(i.vencimento)}${i.status === 'pago' && i.pago_em ? ` · ${tipo === 'rec' ? 'recebido' : 'pago'} em ${dataBR(i.pago_em)}` : ''}${i.forma ? ' · ' + esc(i.forma) : ''}
        ${i.origem === 'cliente' ? ' · <span class="tag-cli">cliente vê</span>' : ''}${i.automatico ? ' · <span class="tag-auto">automática</span>' : ''}</div></div>
    <div class="right"><span class="val">${dinheiro(i.valor)}</span>${badge(st)}
      ${i.status === 'pendente' ? `<button class="btn btn-sm btn-ok" data-quitar>${tipo === 'rec' ? 'Recebido' : 'Pago'}</button>` : i.status === 'pago' ? '<button class="btn btn-sm btn-ghost" data-reabrir>Reabrir</button>' : ''}
      <button class="btn btn-sm" data-editar>Editar</button></div></div>`;
}
function ligarLinhas(el, lista, tipo) {
  $$('[data-filtro]', el).forEach(b => b.onclick = () => { F.filtro = b.dataset.filtro; desenhar(); });
  $$('[data-fin]', el).forEach(r => {
    const [origem, id] = r.dataset.fin.split(':'), i = lista.find(x => x.id === id && x.origem === origem);
    const tabela = origem === 'cliente' ? 'pagamentos' : 'lancamentos';
    $('[data-quitar]', r)?.addEventListener('click', async () => {
      const { error } = await sb.from(tabela).update({ status: 'pago', pago_em: hojeIso() }).eq('id', id);
      if (error) return toast(erroAmigavel(error), true);
      recarregar(origem === 'cliente' ? 'Marcado como recebido. O cliente já vê como pago.' : tipo === 'rec' ? 'Marcado como recebido.' : 'Marcado como pago.');
    });
    $('[data-reabrir]', r)?.addEventListener('click', async () => {
      const { error } = await sb.from(tabela).update({ status: 'pendente', pago_em: null }).eq('id', id);
      if (error) return toast(erroAmigavel(error), true); recarregar('Reaberto.');
    });
    $('[data-editar]', r).onclick = () => tipo === 'rec' ? formReceita(i) : formDespesa(i);
  });
}

function receber() {
  const el = $('#faba'), lista = filtrar(receitas());
  el.innerHTML = `${barraFiltros(lista, soma(lista))}
    ${lista.length ? `<div class="list">${lista.map(i => linhaFin(i, 'rec')).join('')}</div>` : `<div class="empty-state">${F.filtro === 'atrasados' ? 'Nada atrasado. 🎉' : 'Nada para receber neste filtro.'}</div>`}`;
  ligarLinhas(el, receitas(), 'rec');
}
function pagar() {
  const el = $('#faba'), lista = filtrar(despesas());
  el.innerHTML = `${barraFiltros(lista, soma(lista))}
    ${lista.length ? `<div class="list">${lista.map(i => linhaFin(i, 'desp')).join('')}</div>` : `<div class="empty-state">${F.filtro === 'atrasados' ? 'Nada atrasado. 🎉' : 'Nada a pagar neste filtro.'}</div>`}`;
  ligarLinhas(el, despesas(), 'desp');
}

/* ---------- Parceiros ---------- */
function parceiros() {
  const el = $('#faba');
  el.innerHTML = `
    <div class="panel-h"><p class="vazio-txt" style="max-width:600px">Vincule o parceiro ao cliente na aba <b>Dados</b> do cliente. Quando uma mensalidade desse cliente for marcada como paga, a comissão entra sozinha em <b>A pagar</b>.</p>
      <button class="btn btn-sm btn-primary" id="p-novo">${ICON.plus}Novo parceiro</button></div>
    ${F.parceiros.length ? `<div class="parceiros">${F.parceiros.map(p => {
      const coms = despesas().filter(i => i.parceiro_id === p.id && i.categoria === 'Comissão de parceiro');
      const pend = coms.filter(i => i.status === 'pendente'), pagas = coms.filter(i => i.status === 'pago');
      const clientes = F.vinc.filter(v => v.parceiro_id === p.id).map(v => ({ nome: F.ctx.nomeConta(v.conta_id), pct: v.comissao_pct ?? p.comissao_pct }));
      return `<div class="parc${p.ativo ? '' : ' off'}" data-parc="${p.id}">
        <div class="parc-top"><div><b>${esc(p.nome)}</b><small>${vBR(p.comissao_pct)}% de comissão${p.contato ? ' · ' + esc(p.contato) : ''}${p.ativo ? '' : ' · inativo'}</small></div><button class="btn btn-sm" data-ed-parc>Editar</button></div>
        ${p.chave_pix ? `<div class="ac-linha"><span class="lbl">PIX</span><code>${esc(p.chave_pix)}</code><button class="icon-btn sm" data-pix aria-label="Copiar PIX">${ICON.copy}</button></div>` : ''}
        <div class="parc-nums"><div><span class="lbl">A pagar</span><strong>${dinheiro(soma(pend))}</strong></div><div><span class="lbl">Já pago</span><strong>${dinheiro(soma(pagas))}</strong></div><div><span class="lbl">Clientes</span><strong>${clientes.length}</strong></div></div>
        ${clientes.length ? `<p class="parc-cli">${clientes.map(c => `${esc(c.nome)} (${vBR(c.pct)}%)`).join(' · ')}</p>` : '<p class="parc-cli vazio-txt">Nenhum cliente vinculado.</p>'}
        ${pend.length ? `<div class="list" style="margin-top:10px">${pend.map(i => `<div class="row mini-row" data-com="${i.id}"><div><h4>${dinheiro(i.valor)}</h4><div class="sub">${esc(i.descricao.replace(/^Comissão [^·]+· /, ''))} · ${dataBR(i.vencimento, { day: '2-digit', month: '2-digit' })}</div></div><div class="right"><button class="btn btn-sm btn-ok" data-pagar-com>Pagar</button></div></div>`).join('')}
          ${pend.length > 1 ? `<button class="btn btn-sm btn-ok" data-pagar-todas style="margin-top:8px">Pagar todas (${dinheiro(soma(pend))})</button>` : ''}</div>` : ''}
      </div>`;
    }).join('')}</div>` : '<div class="empty-state"><b>Nenhum parceiro ainda</b>Cadastre quem indica clientes para a MLX e quanto recebe de comissão.</div>'}`;
  $('#p-novo').onclick = () => formParceiro(null);
  $$('[data-parc]', el).forEach(c => {
    const p = F.parceiros.find(x => x.id === c.dataset.parc);
    $('[data-ed-parc]', c).onclick = () => formParceiro(p);
    $('[data-pix]', c)?.addEventListener('click', () => copiar(p.chave_pix));
    $$('[data-com]', c).forEach(r => $('[data-pagar-com]', r).onclick = async () => {
      const { error } = await sb.from('lancamentos').update({ status: 'pago', pago_em: hojeIso(), forma_pagamento: 'PIX' }).eq('id', r.dataset.com);
      if (error) return toast(erroAmigavel(error), true); recarregar('Comissão paga.');
    });
    $('[data-pagar-todas]', c)?.addEventListener('click', async () => {
      const ids = $$('[data-com]', c).map(r => r.dataset.com);
      if (!confirm(`Marcar ${ids.length} comissões de ${p.nome} como pagas?`)) return;
      const { error } = await sb.from('lancamentos').update({ status: 'pago', pago_em: hojeIso(), forma_pagamento: 'PIX' }).in('id', ids);
      if (error) return toast(erroAmigavel(error), true); recarregar('Comissões pagas.');
    });
  });
}

/* ---------- formulários ---------- */
const dlg = () => $('#dlg');
const opts = (lista, v) => lista.map(x => `<option${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
const repetirCampo = `<div class="field"><label for="x-rep">Repetir todo mês</label><select id="x-rep">${[1, 2, 3, 4, 6, 12].map(n => `<option value="${n}">${n === 1 ? 'Não repetir' : n + ' meses'}</option>`).join('')}</select></div>`;
function datasRepetidas(venc, n) {
  const d0 = parseData(venc);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(d0.getFullYear(), d0.getMonth() + i, 1);
    d.setDate(Math.min(d0.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return isoData(d);
  });
}
function msg(d, t) { const m = $('#x-msg', d); m.textContent = t; m.hidden = false; }

function formReceita(i) {
  const contas = F.ctx.contas();
  const ehCli = i ? i.origem === 'cliente' : true;
  abrirModal(dlg(), `<h2>${i ? 'Editar receita' : 'Nova receita'}</h2>
    <p class="dsub">${i ? (ehCli ? 'Mensalidade de cliente: o que mudar aqui o cliente vê.' : 'Receita avulsa: só a equipe vê.') : 'Vinculada a um cliente, ela aparece na área dele em Pagamentos.'}</p>
    <form id="f-x" novalidate><div class="grid-2">
      <div class="field full"><label for="x-cli">Cliente</label><select id="x-cli"${i ? ' disabled' : ''}>
        <option value="">Sem cliente (receita avulsa, cliente não vê)</option>${contas.map(c => `<option value="${c.id}"${(i?.conta_id || (!i && '')) === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="field full"><label for="x-desc">Descrição</label><input id="x-desc" maxlength="200" value="${esc(i?.descricao || 'Mensalidade')}"></div>
      <div class="field"><label for="x-val">Valor (R$)</label><input id="x-val" inputmode="decimal" value="${vBR(i?.valor)}" placeholder="1.500,00"></div>
      <div class="field"><label for="x-venc">Vencimento</label><input id="x-venc" type="date" value="${esc(i?.vencimento || hojeIso())}"></div>
      <div class="field" data-so-avulsa><label for="x-cat">Categoria</label><input id="x-cat" list="x-cats" maxlength="60" value="${esc(i?.origem === 'avulsa' ? i.categoria : 'Serviço avulso')}"><datalist id="x-cats">${CAT_REC.map(c => `<option value="${c}">`).join('')}</datalist></div>
      <div class="field"><label for="x-forma">Forma de pagamento</label><select id="x-forma"><option value="">—</option>${opts(FORMAS, i?.forma)}</select></div>
      <div class="field full" data-so-cli><label for="x-link">Link de pagamento (opcional, o cliente vê)</label><input id="x-link" type="url" maxlength="500" value="${esc(i?.link_pagamento || '')}" placeholder="https://…"></div>
      <div class="field"><label for="x-st">Situação</label><select id="x-st">${[['pendente', 'Em aberto'], ['pago', 'Recebido'], ['cancelado', 'Cancelado']].map(([k, t]) => `<option value="${k}"${(i?.status || 'pendente') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      ${i ? '' : repetirCampo}
      <div class="field full"><label for="x-obs">Observação</label><input id="x-obs" maxlength="500" value="${esc(i?.observacao || '')}"></div>
    </div><div id="x-msg" class="form-msg err" hidden></div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar</button>${i ? '<button class="btn btn-danger" type="button" id="x-del">Excluir</button>' : ''}<button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div></form>`, d => {
    const ajustar = () => { const cli = !!$('#x-cli', d).value || (i && ehCli); $$('[data-so-cli]', d).forEach(e => e.hidden = !cli); $$('[data-so-avulsa]', d).forEach(e => e.hidden = cli); };
    $('#x-cli', d).onchange = ajustar; ajustar();
    $('#x-del', d)?.addEventListener('click', async () => {
      if (!confirm('Excluir essa receita?')) return;
      const { error } = await sb.from(ehCli ? 'pagamentos' : 'lancamentos').delete().eq('id', i.id);
      if (error) return msg(d, erroAmigavel(error)); d.close(); recarregar('Excluída.');
    });
    $('#f-x', d).onsubmit = async e => {
      e.preventDefault();
      const valor = parseValor($('#x-val', d).value), venc = $('#x-venc', d).value, desc = $('#x-desc', d).value.trim(), st = $('#x-st', d).value;
      if (!desc || !venc || !(valor >= 0)) return msg(d, 'Preencha descrição, valor e vencimento.');
      const contaId = i ? i.conta_id : $('#x-cli', d).value || null, cli = i ? ehCli : !!contaId;
      const link = cli ? $('#x-link', d).value.trim() : '';
      if (link && !/^https?:\/\//i.test(link)) return msg(d, 'O link precisa começar com https://');
      const base = { descricao: desc, valor, status: st, forma_pagamento: $('#x-forma', d).value || null, observacao: $('#x-obs', d).value.trim() || null };
      let error;
      if (i) {
        const upd = { ...base, vencimento: venc, pago_em: st === 'pago' ? (i.pago_em || hojeIso()) : null };
        ({ error } = cli ? await sb.from('pagamentos').update({ ...upd, link_pagamento: link || null }).eq('id', i.id)
                         : await sb.from('lancamentos').update({ ...upd, categoria: $('#x-cat', d).value.trim() || 'Outros' }).eq('id', i.id));
      } else {
        const linhas = datasRepetidas(venc, +$('#x-rep', d).value).map((v, k) => ({ ...base, vencimento: v, status: k === 0 ? st : 'pendente', pago_em: k === 0 && st === 'pago' ? hojeIso() : null }));
        ({ error } = cli ? await sb.from('pagamentos').insert(linhas.map(l => ({ ...l, conta_id: contaId, link_pagamento: link || null })))
                         : await sb.from('lancamentos').insert(linhas.map(l => ({ ...l, tipo: 'receita', categoria: $('#x-cat', d).value.trim() || 'Outros' }))));
      }
      if (error) return msg(d, erroAmigavel(error));
      d.close(); recarregar(cli ? 'Salvo. O cliente já vê na área dele.' : 'Receita salva.');
    };
  });
}

function formDespesa(i) {
  const contas = F.ctx.contas();
  abrirModal(dlg(), `<h2>${i ? 'Editar despesa' : 'Nova despesa'}</h2>
    <p class="dsub">${i?.automatico ? 'Comissão gerada automaticamente quando o cliente pagou.' : 'Contas a pagar da MLX. Só a equipe vê.'}</p>
    <form id="f-x" novalidate><div class="grid-2">
      <div class="field full"><label for="x-desc">Descrição</label><input id="x-desc" maxlength="200" value="${esc(i?.descricao || '')}" placeholder="Ex.: Assinatura Canva Pro"></div>
      <div class="field"><label for="x-cat">Categoria</label><input id="x-cat" list="x-cats" maxlength="60" value="${esc(i?.categoria || '')}" placeholder="Escolha ou digite"><datalist id="x-cats">${CAT_DESP.map(c => `<option value="${c}">`).join('')}</datalist></div>
      <div class="field"><label for="x-val">Valor (R$)</label><input id="x-val" inputmode="decimal" value="${vBR(i?.valor)}" placeholder="99,90"></div>
      <div class="field"><label for="x-venc">Vencimento</label><input id="x-venc" type="date" value="${esc(i?.vencimento || hojeIso())}"></div>
      <div class="field"><label for="x-st">Situação</label><select id="x-st">${[['pendente', 'Em aberto'], ['pago', 'Pago'], ['cancelado', 'Cancelado']].map(([k, t]) => `<option value="${k}"${(i?.status || 'pendente') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label for="x-parc">Parceiro (opcional)</label><select id="x-parc"><option value="">—</option>${F.parceiros.map(p => `<option value="${p.id}"${i?.parceiro_id === p.id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
      <div class="field"><label for="x-cli">Cliente relacionado (opcional)</label><select id="x-cli"><option value="">—</option>${contas.map(c => `<option value="${c.id}"${i?.conta_id === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="field"><label for="x-forma">Forma de pagamento</label><select id="x-forma"><option value="">—</option>${opts(FORMAS, i?.forma)}</select></div>
      ${i ? '' : repetirCampo}
      <div class="field full"><label for="x-obs">Observação</label><input id="x-obs" maxlength="500" value="${esc(i?.observacao || '')}"></div>
    </div><div id="x-msg" class="form-msg err" hidden></div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar</button>${i ? '<button class="btn btn-danger" type="button" id="x-del">Excluir</button>' : ''}<button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div></form>`, d => {
    $('#x-del', d)?.addEventListener('click', async () => {
      if (!confirm('Excluir essa despesa?')) return;
      const { error } = await sb.from('lancamentos').delete().eq('id', i.id);
      if (error) return msg(d, erroAmigavel(error)); d.close(); recarregar('Excluída.');
    });
    $('#f-x', d).onsubmit = async e => {
      e.preventDefault();
      const valor = parseValor($('#x-val', d).value), venc = $('#x-venc', d).value, desc = $('#x-desc', d).value.trim(), st = $('#x-st', d).value;
      if (!desc || !venc || !(valor >= 0)) return msg(d, 'Preencha descrição, valor e vencimento.');
      const base = { tipo: 'despesa', descricao: desc, categoria: $('#x-cat', d).value.trim() || 'Outros', valor, status: st,
        parceiro_id: $('#x-parc', d).value || null, conta_id: $('#x-cli', d).value || null,
        forma_pagamento: $('#x-forma', d).value || null, observacao: $('#x-obs', d).value.trim() || null };
      const { error } = i
        ? await sb.from('lancamentos').update({ ...base, vencimento: venc, pago_em: st === 'pago' ? (i.pago_em || hojeIso()) : null }).eq('id', i.id)
        : await sb.from('lancamentos').insert(datasRepetidas(venc, +$('#x-rep', d).value).map((v, k) => ({ ...base, vencimento: v, status: k === 0 ? st : 'pendente', pago_em: k === 0 && st === 'pago' ? hojeIso() : null })));
      if (error) return msg(d, erroAmigavel(error));
      d.close(); recarregar('Despesa salva.');
    };
  });
}

function formParceiro(p) {
  abrirModal(dlg(), `<h2>${p ? 'Editar parceiro' : 'Novo parceiro'}</h2><p class="dsub">Quem indica clientes para a MLX.</p>
    <form id="f-x" novalidate><div class="grid-2">
      <div class="field full"><label for="x-nome">Nome</label><input id="x-nome" maxlength="120" value="${esc(p?.nome || '')}"></div>
      <div class="field"><label for="x-pct">Comissão padrão (%)</label><input id="x-pct" inputmode="decimal" value="${vBR(p?.comissao_pct ?? 10)}"></div>
      <div class="field"><label for="x-cont">Contato</label><input id="x-cont" maxlength="120" value="${esc(p?.contato || '')}" placeholder="WhatsApp ou e-mail"></div>
      <div class="field full"><label for="x-pix">Chave PIX</label><input id="x-pix" maxlength="140" value="${esc(p?.chave_pix || '')}"></div>
      <div class="field full"><label for="x-obs">Observação</label><input id="x-obs" maxlength="1000" value="${esc(p?.observacao || '')}" placeholder="Ex.: comissão só nos 6 primeiros meses"></div>
      ${p ? `<div class="field full"><label class="check check-box"><input type="checkbox" id="x-ativo"${p.ativo ? ' checked' : ''}> Ativo (gera comissão automática)</label></div>` : ''}
    </div><div id="x-msg" class="form-msg err" hidden></div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar</button>${p ? '<button class="btn btn-danger" type="button" id="x-del">Excluir</button>' : ''}<button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div></form>`, d => {
    $('#x-del', d)?.addEventListener('click', async () => {
      if (!confirm(`Excluir ${p.nome}? As comissões já lançadas continuam no financeiro.`)) return;
      const { error } = await sb.from('parceiros').delete().eq('id', p.id);
      if (error) return msg(d, erroAmigavel(error)); d.close(); recarregar('Parceiro excluído.');
    });
    $('#f-x', d).onsubmit = async e => {
      e.preventDefault();
      const nome = $('#x-nome', d).value.trim(), pct = parseValor($('#x-pct', d).value);
      if (!nome) return msg(d, 'Informe o nome.');
      if (!(pct >= 0 && pct <= 100)) return msg(d, 'Comissão entre 0 e 100%.');
      const reg = { nome, comissao_pct: pct, contato: $('#x-cont', d).value.trim() || null, chave_pix: $('#x-pix', d).value.trim() || null, observacao: $('#x-obs', d).value.trim() || null };
      if (p) reg.ativo = $('#x-ativo', d).checked;
      const { error } = p ? await sb.from('parceiros').update(reg).eq('id', p.id) : await sb.from('parceiros').insert(reg);
      if (error) return msg(d, erroAmigavel(error));
      d.close(); recarregar('Parceiro salvo.');
    };
  });
}

/* ---------- exportar ---------- */
function exportarCSV() {
  const linhas = [['Tipo', 'Descrição', 'Cliente/Parceiro', 'Categoria', 'Vencimento', 'Valor', 'Situação', 'Pago em', 'Forma']];
  const st = s => ({ pendente: 'Em aberto', pago: 'Pago', cancelado: 'Cancelado' }[s]);
  doMes(receitas(), F.mes).forEach(i => linhas.push(['Receber', i.descricao, i.conta_id ? F.ctx.nomeConta(i.conta_id) : '', i.categoria, dataBR(i.vencimento), vBR(Number(i.valor).toFixed(2)), st(i.status), i.pago_em ? dataBR(i.pago_em) : '', i.forma || '']));
  doMes(despesas(), F.mes).forEach(i => linhas.push(['Pagar', i.descricao, i.conta_id ? F.ctx.nomeConta(i.conta_id) : nomeParceiro(i.parceiro_id), i.categoria, dataBR(i.vencimento), vBR(Number(i.valor).toFixed(2)), st(i.status), i.pago_em ? dataBR(i.pago_em) : '', i.forma || '']));
  const csv = '﻿' + linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `financeiro-mlx-${F.mes.slice(0, 7)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- vínculo cliente ↔ parceiro (usado na aba Dados do cliente) ---------- */
export async function blocoParceiroConta(el, contaId) {
  const [{ data: parcs }, { data: v }] = await Promise.all([
    sb.from('parceiros').select('id,nome,comissao_pct,ativo').order('nome'),
    sb.from('conta_parceiro').select('*').eq('conta_id', contaId).maybeSingle()
  ]);
  el.innerHTML = `<h3>Indicado por parceiro</h3>
    <p class="vazio-txt" style="margin-bottom:12px">O cliente não vê isso. A comissão é lançada sozinha em Financeiro → A pagar sempre que uma mensalidade for marcada como paga.</p>
    <div class="grid-2">
      <div class="field"><label for="cp-parc">Parceiro</label><select id="cp-parc"><option value="">Nenhum</option>${(parcs || []).map(p => `<option value="${p.id}"${v?.parceiro_id === p.id ? ' selected' : ''}>${esc(p.nome)} (${vBR(p.comissao_pct)}%)${p.ativo ? '' : ' · inativo'}</option>`).join('')}</select></div>
      <div class="field"><label for="cp-pct">Comissão para este cliente (%)</label><input id="cp-pct" inputmode="decimal" value="${vBR(v?.comissao_pct)}" placeholder="Usa o padrão do parceiro"></div>
    </div>
    <button class="btn btn-sm" id="cp-salvar">Salvar parceiro</button>${!(parcs || []).length ? ' <span class="vazio-txt">Cadastre parceiros em Financeiro → Parceiros.</span>' : ''}`;
  $('#cp-salvar', el).onclick = async () => {
    const pid = $('#cp-parc', el).value, t = $('#cp-pct', el).value.trim(), pct = t ? parseValor(t) : null;
    if (pct !== null && !(pct >= 0 && pct <= 100)) return toast('Comissão entre 0 e 100%.', true);
    const { error } = pid
      ? await sb.from('conta_parceiro').upsert({ conta_id: contaId, parceiro_id: pid, comissao_pct: pct }, { onConflict: 'conta_id' })
      : await sb.from('conta_parceiro').delete().eq('conta_id', contaId);
    if (error) return toast(erroAmigavel(error), true);
    toast(pid ? 'Parceiro vinculado.' : 'Vínculo removido.');
  };
}
