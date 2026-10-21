/* =========================================================
   MLX Mind · Meu checklist (painel admin)
   Cada pessoa da equipe vê só o próprio checklist.
   Tabelas: checklist_tarefas e checklist_notas (ver checklist.sql)
   ========================================================= */
import { sb, $, $$, esc, isoData, hoje, parseData, cap, toast, erroAmigavel, abrirModal, badge, ICON } from './comum.js';

export const ICONE_CHECKLIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 1.5 1.5L12 8M8 15l1.5 1.5L12 14M14.5 9.5H17M14.5 15.5H17"/></svg>';

const CATS = {
  geral: ['Geral', 'b-dim'], mlx: ['MLX', 'b-purple'], cliente: ['Cliente', 'b-info'],
  faculdade: ['Faculdade', 'b-warn'], estudos: ['Estudos', 'b-ok'], pessoal: ['Pessoal', 'b-rosa']
};
const ORDEM = ['geral', 'mlx', 'cliente', 'faculdade', 'estudos', 'pessoal'];
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const IC = {
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  rep: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a5 5 0 0 1 9-3M13 9a5 5 0 0 1-9 3"/><path d="M12.5 1.5v3h-3M3.5 14.5v-3h3"/></svg>',
  mais: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12.5" cy="8" r="1.4"/></svg>'
};

const C = {
  ctx: null, sel: null, faixa: null, filtro: 'todas', menu: null, sobre: 'geral',
  tarefas: [], notas: {}, salvas: {}, semTabela: false, foco: null, focoAdd: false, notaPend: null, notaTimer: null
};

/* ---------- datas ---------- */
const hojeIso = () => isoData(hoje());
const somaDias = (iso, n) => { const d = parseData(iso); d.setDate(d.getDate() + n); return isoData(d); };
const inicioSem = iso => somaDias(iso, -((parseData(iso).getDay() + 6) % 7));
const fmt = (iso, o) => parseData(iso).toLocaleDateString('pt-BR', o);
const curta = iso => fmt(iso, { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');

/* ---------- regras ---------- */
const cat = t => (CATS[t.categoria] ? t.categoria : 'geral');
const feitoNo = (t, d) => (t.repete ? !!(t.feito_em && t.feito_em[d]) : !!t.feito);
const apareceNo = (t, d) => (t.repete ? t.data <= d && (!t.ate || d <= t.ate) : t.data === d);
function doDia(d) {
  return C.tarefas.filter(t => apareceNo(t, d))
    .map(t => ({ t, feito: feitoNo(t, d) }))
    .sort((a, b) => (a.feito - b.feito) || String(a.t.criado_em).localeCompare(String(b.t.criado_em)));
}
const atrasadas = () => C.tarefas.filter(t => !t.repete && !t.feito && t.data < hojeIso()).sort((a, b) => a.data.localeCompare(b.data));
function nomeCliente(id) { const n = C.ctx.nomeConta(id); return n && n !== '—' ? n : 'Cliente'; }
const rotulo = t => (cat(t) === 'cliente' && t.conta_id ? nomeCliente(t.conta_id) : CATS[cat(t)][0]);
const semTabela = e => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message || ''));

function opcoesSobre(v) {
  const base = ['geral', 'mlx', 'faculdade', 'estudos', 'pessoal']
    .map(k => `<option value="${k}"${v === k ? ' selected' : ''}>${CATS[k][0]}</option>`).join('');
  const contas = C.ctx.contas();
  return base + (contas.length ? `<optgroup label="Cliente">${contas.map(c =>
    `<option value="c:${esc(c.id)}"${v === 'c:' + c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</optgroup>` : '');
}
const deSobre = v => (v.startsWith('c:') ? { categoria: 'cliente', conta_id: v.slice(2) } : { categoria: v, conta_id: null });
const paraSobre = t => (cat(t) === 'cliente' && t.conta_id ? 'c:' + t.conta_id : cat(t));

// uma gravação por vez em cada tarefa (evita ordem trocada em cliques rápidos)
const filas = new Map();
function emFila(id, fn) { const p = (filas.get(id) || Promise.resolve()).then(fn); filas.set(id, p.catch(() => {})); return p; }
const tab = () => sb.from('checklist_tarefas');

/* ---------- dados ---------- */
async function carregar() {
  const ini = inicioSem(C.sel), fim = somaDias(ini, 6), uid = C.ctx.eu.id;
  const [t, n] = await Promise.all([
    tab().select('*').eq('user_id', uid)
      .or(`repete.eq.true,feito.eq.false,and(data.gte.${ini},data.lte.${fim})`)
      .order('criado_em').limit(2000),
    sb.from('checklist_notas').select('data,texto').eq('user_id', uid).gte('data', ini).lte('data', fim)
  ]);
  const erro = t.error || n.error;
  if (semTabela(erro)) { C.semTabela = true; return; }
  if (erro) toast(erroAmigavel(erro), true);
  C.semTabela = false;
  C.tarefas = t.data || [];
  (n.data || []).forEach(x => { C.notas[x.data] = x.texto; C.salvas[x.data] = x.texto; });
  C.faixa = ini;
}

/* ---------- ponto de entrada ---------- */
export async function vistaChecklist(main, ctx) {
  C.ctx = ctx;
  if (!C.sel) C.sel = hojeIso();
  C.menu = null;
  main.innerHTML = '<div class="loading"><div><div class="spin"></div>Carregando seu checklist…</div></div>';
  await carregar();
  desenhar();
}

async function irPara(d) {
  salvarNota();
  const outraSemana = inicioSem(d) !== C.faixa;
  C.sel = d; C.menu = null; C.filtro = 'todas';
  if (outraSemana) {
    C.ctx.main.querySelector('.ck-lista, .empty-state')?.classList.add('ck-carregando');
    await carregar();
  }
  desenhar();
}

/* ---------- tela ---------- */
function desenhar() {
  const { main, barraMobile, ligarVoltar } = C.ctx;
  if (C.semTabela) {
    main.innerHTML = `${barraMobile()}
      <div class="main-head"><div><h1>Meu checklist</h1><p>Falta um passo para ativar.</p></div></div>
      <div class="empty-state"><b>As tabelas do checklist ainda não existem no Supabase</b>
        Abra o Supabase da MLX, vá em SQL Editor, cole o conteúdo do arquivo <b style="display:inline">checklist.sql</b> e clique em Run. Depois recarregue esta página.</div>`;
    ligarVoltar();
    return;
  }
  const d = C.sel, H = hojeIso(), dif = Math.round((parseData(d) - parseData(H)) / 864e5);
  const rel = dif === 0 ? 'Hoje' : dif === -1 ? 'Ontem' : dif === 1 ? 'Amanhã' : dif < 0 ? `Há ${-dif} dias` : `Daqui a ${dif} dias`;
  const itens = doDia(d), tot = itens.length, ok = itens.filter(x => x.feito).length;
  const presentes = ORDEM.filter(k => itens.some(x => cat(x.t) === k));
  if (C.filtro !== 'todas' && !presentes.includes(C.filtro)) C.filtro = 'todas';
  const vis = C.filtro === 'todas' ? itens : itens.filter(x => cat(x.t) === C.filtro);
  const ini = inicioSem(d), late = dif === 0 ? atrasadas() : [];

  const semana = Array.from({ length: 7 }, (_, i) => {
    const k = somaDias(ini, i), its = doDia(k), t2 = its.length, o2 = its.filter(x => x.feito).length;
    return `<button type="button" class="ck-dia${k === H ? ' hoje' : ''}" data-dia="${k}" aria-pressed="${k === d}"
      aria-label="${esc(cap(fmt(k, { weekday: 'long', day: 'numeric' })))}: ${t2 ? `${o2} de ${t2} feitas` : 'sem tarefas'}">
      <small>${DIAS[i]}</small><b>${parseData(k).getDate()}</b><i><span style="width:${t2 ? Math.round(o2 / t2 * 100) : 0}%"></span></i></button>`;
  }).join('');

  main.innerHTML = `${barraMobile()}
    <div class="main-head">
      <div><span class="ck-eyebrow">${rel}</span><h1>${esc(cap(fmt(d, { weekday: 'long' })))}</h1>
        <p>${esc(fmt(d, { day: 'numeric', month: 'long', year: 'numeric' }))} · só você vê esta lista</p></div>
      <div class="ck-nav">${dif ? '<button class="btn btn-sm" id="ck-hoje">Hoje</button>' : ''}
        <button class="icon-btn" id="ck-ant" aria-label="Dia anterior">${ICON.prev}</button>
        <button class="icon-btn" id="ck-prox" aria-label="Próximo dia">${ICON.next}</button></div>
    </div>
    <div class="ck-prog"><div class="barra"><i style="width:${tot ? Math.round(ok / tot * 100) : 0}%"></i></div>
      <span>${tot ? (ok === tot ? `Tudo feito · ${ok}/${tot}` : `${ok} de ${tot} feitas`) : 'Nada na lista'}</span></div>
    <div class="ck-semana" role="group" aria-label="Dias da semana">${semana}</div>
    <div class="ck-grid">
      <div class="ck-col">
        <form class="panel ck-add" id="ck-form" autocomplete="off">
          <input class="inp" id="ck-txt" maxlength="300" placeholder="O que precisa fazer?" aria-label="Nova tarefa" enterkeyhint="done">
          <div class="ck-opts">
            <select class="sel-sm" id="ck-sobre" aria-label="Sobre o quê">${opcoesSobre(C.sobre)}</select>
            <label class="chip-check"><input type="checkbox" id="ck-rep"><span>${IC.rep}Repetir todo dia</span></label>
            <button class="btn btn-primary btn-sm" type="submit">${ICON.plus}Adicionar</button>
          </div>
        </form>
        ${presentes.length > 1 ? `<div class="seg-scroll"><div class="seg">${['todas', ...presentes].map(k =>
          `<button type="button" data-filtro="${k}" aria-pressed="${C.filtro === k}">${k === 'todas' ? 'Todas' : k === 'cliente' ? 'Clientes' : CATS[k][0]}</button>`).join('')}</div></div>` : ''}
        ${tot ? `<div class="ck-lista">${vis.map(linha).join('')}</div>`
          : `<div class="empty-state"><b>Nada pra este dia ainda</b>Escreva a primeira tarefa acima e aperte Enter. O que for rotina, marque "Repetir todo dia" que ela aparece todos os dias.</div>`}
      </div>
      <div class="ck-col">
        ${late.length ? `<div class="panel">
          <div class="panel-h"><h3>Ficou pra trás <span class="count alerta">${late.length}</span></h3><button class="btn btn-sm" id="ck-trazer">Trazer todas pra hoje</button></div>
          <div class="ck-late">${late.map(t => `<div class="ck-late-i"><div><b>${esc(t.texto)}</b><small>${esc(curta(t.data))} · ${esc(rotulo(t))}</small></div>
            <button class="btn btn-sm" data-trazer="${t.id}">Pra hoje</button></div>`).join('')}</div></div>` : ''}
        <div class="panel">
          <div class="panel-h"><h3>Notas do dia</h3><small class="vazio-txt" id="ck-nota-st" aria-live="polite"></small></div>
          <textarea class="inp inp-area ck-nota" id="ck-nota" maxlength="5000" placeholder="Ideias, lembretes, o que aconteceu hoje…" aria-label="Notas do dia">${esc(C.notas[d] || '')}</textarea>
        </div>
      </div>
    </div>`;

  ligarVoltar();
  $('#ck-ant').onclick = () => irPara(somaDias(d, -1));
  $('#ck-prox').onclick = () => irPara(somaDias(d, 1));
  $('#ck-hoje')?.addEventListener('click', () => irPara(H));
  $$('[data-dia]', main).forEach(b => b.onclick = () => irPara(b.dataset.dia));
  $$('[data-filtro]', main).forEach(b => b.onclick = () => { C.filtro = b.dataset.filtro; C.menu = null; desenhar(); });
  $('#ck-form').onsubmit = adicionar;
  $('#ck-sobre').onchange = e => { C.sobre = e.target.value; };
  $$('.ck-item', main).forEach(el => {
    const t = C.tarefas.find(x => x.id === el.dataset.id);
    if (!t) return;
    $$('[data-toggle]', el).forEach(b => b.onclick = () => alternar(t));
    $('[data-menu]', el).onclick = () => { C.menu = C.menu === t.id ? null : t.id; C.foco = { id: t.id, sel: '[data-menu]' }; desenhar(); };
    $('[data-editar]', el)?.addEventListener('click', () => editar(t));
    $('[data-amanha]', el)?.addEventListener('click', () => mover(t));
    $('[data-excluir]', el)?.addEventListener('click', () => excluir(t));
    $('[data-abrir]', el)?.addEventListener('click', e => { e.stopPropagation(); salvarNota(); C.ctx.abrirConta(t.conta_id); });
  });
  $$('[data-trazer]', main).forEach(b => b.onclick = () => trazer([b.dataset.trazer]));
  $('#ck-trazer')?.addEventListener('click', () => trazer(atrasadas().map(t => t.id)));

  const nota = $('#ck-nota');
  nota.oninput = () => {
    C.notaPend = { d, texto: nota.value };
    $('#ck-nota-st').textContent = 'Digitando…';
    clearTimeout(C.notaTimer); C.notaTimer = setTimeout(salvarNota, 900);
  };
  nota.onblur = salvarNota;

  if (C.foco) { $(`.ck-item[data-id="${C.foco.id}"] ${C.foco.sel}`, main)?.focus(); C.foco = null; }
  if (C.focoAdd) { $('#ck-txt').focus(); C.focoAdd = false; }
}

function linha({ t, feito }) {
  const aberto = C.menu === t.id, k = cat(t);
  const chip = k === 'cliente' && t.conta_id
    ? `<button type="button" class="badge b-info ck-cli" data-abrir title="Abrir cliente">${esc(nomeCliente(t.conta_id))}</button>`
    : badge(CATS[k]);
  return `<div class="ck-item${feito ? ' feito' : ''}" data-id="${esc(t.id)}">
    <button type="button" class="ck-check" data-toggle aria-pressed="${feito}" aria-label="${feito ? 'Desmarcar' : 'Marcar como feita'}: ${esc(t.texto)}">${IC.check}</button>
    <div class="ck-corpo"><p class="ck-txt" data-toggle>${esc(t.texto)}</p>
      <div class="ck-meta">${chip}${t.repete ? `<span class="ck-rep">${IC.rep}todo dia</span>` : ''}</div></div>
    <button type="button" class="icon-btn sm ck-mais" data-menu aria-label="Opções da tarefa" aria-expanded="${aberto}">${IC.mais}</button>
    ${aberto ? `<div class="ck-acts">
      <button type="button" class="btn btn-sm" data-editar>Editar</button>
      ${!t.repete && !feito ? `<button type="button" class="btn btn-sm" data-amanha>${C.sel === hojeIso() ? 'Pra amanhã' : 'Pro dia seguinte'}</button>` : ''}
      <button type="button" class="btn btn-sm btn-danger" data-excluir>${t.repete ? 'Parar de repetir' : 'Excluir'}</button></div>` : ''}
  </div>`;
}

/* ---------- ações ---------- */
async function adicionar(e) {
  e.preventDefault();
  const inp = $('#ck-txt'), texto = inp.value.trim();
  if (!texto) return inp.focus();
  const btn = e.submitter; if (btn) btn.disabled = true;
  C.sobre = $('#ck-sobre').value;
  const reg = { user_id: C.ctx.eu.id, texto, ...deSobre(C.sobre), data: C.sel, repete: $('#ck-rep').checked };
  const { data, error } = await tab().insert(reg).select().single();
  if (btn) btn.disabled = false;
  if (error) return toast(erroAmigavel(error), true);
  C.tarefas.push(data); C.focoAdd = true; desenhar();
}

async function alternar(t) {
  const d = C.sel, antes = { feito: t.feito, feito_em: t.feito_em };
  let upd;
  if (t.repete) { const m = { ...(t.feito_em || {}) }; if (m[d]) delete m[d]; else m[d] = true; upd = { feito_em: m }; }
  else upd = { feito: !t.feito };
  Object.assign(t, upd); C.foco = { id: t.id, sel: '.ck-check' }; desenhar();
  const { error } = await emFila(t.id, () => tab().update(upd).eq('id', t.id));
  if (error) { Object.assign(t, antes); desenhar(); toast(erroAmigavel(error), true); }
}

async function mover(t) {
  const prox = somaDias(C.sel, 1);
  const { error } = await emFila(t.id, () => tab().update({ data: prox, feito: false }).eq('id', t.id));
  if (error) return toast(erroAmigavel(error), true);
  Object.assign(t, { data: prox, feito: false }); C.menu = null; desenhar();
  toast(C.sel === hojeIso() ? 'Movida pra amanhã.' : 'Movida pro dia seguinte.');
}

async function excluir(t) {
  if (t.repete && t.data < C.sel) {
    if (!confirm(`Parar de repetir "${t.texto}" a partir de ${curta(C.sel)}? Os dias anteriores ficam como estão.`)) return;
    const ate = somaDias(C.sel, -1);
    const { error } = await emFila(t.id, () => tab().update({ ate }).eq('id', t.id));
    if (error) return toast(erroAmigavel(error), true);
    t.ate = ate; C.menu = null; desenhar(); toast('Não repete mais.');
    return;
  }
  if (!confirm(`Excluir "${t.texto}"?`)) return;
  const { error } = await emFila(t.id, () => tab().delete().eq('id', t.id));
  if (error) return toast(erroAmigavel(error), true);
  C.tarefas = C.tarefas.filter(x => x.id !== t.id); C.menu = null; desenhar(); toast('Tarefa excluída.');
}

async function trazer(ids) {
  if (!ids.length) return;
  const H = hojeIso();
  const { error } = await tab().update({ data: H }).in('id', ids);
  if (error) return toast(erroAmigavel(error), true);
  C.tarefas.forEach(t => { if (ids.includes(t.id)) t.data = H; });
  desenhar(); toast(ids.length > 1 ? `${ids.length} tarefas trazidas pra hoje.` : 'Trazida pra hoje.');
}

function editar(t) {
  C.menu = null;
  abrirModal(C.ctx.dlg, `<h2>Editar tarefa</h2>
    <p class="dsub">${t.repete ? 'Repete todo dia desde ' + esc(curta(t.data)) : esc(cap(fmt(t.data, { weekday: 'long', day: 'numeric', month: 'long' })))}</p>
    <form id="ck-ed" novalidate>
      <div class="field"><label for="ce-txt">Tarefa</label><input id="ce-txt" maxlength="300" value="${esc(t.texto)}"></div>
      <div class="grid-2">
        <div class="field"><label for="ce-sobre">Sobre</label><select id="ce-sobre">${opcoesSobre(paraSobre(t))}</select></div>
        <div class="field"><label for="ce-data">${t.repete ? 'Começa em' : 'Dia'}</label><input id="ce-data" type="date" value="${esc(t.data)}"></div>
      </div>
      <label class="check" style="margin-bottom:16px"><input type="checkbox" id="ce-rep"${t.repete ? ' checked' : ''}> Repetir todo dia</label>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Salvar</button><button class="btn btn-ghost" type="button" data-fechar>Cancelar</button></div>
    </form>`, dl => {
    $('#ce-txt', dl).focus();
    $('#ck-ed', dl).onsubmit = async e => {
      e.preventDefault();
      const texto = $('#ce-txt', dl).value.trim(), data = $('#ce-data', dl).value;
      if (!texto || !data) return toast('Preencha a tarefa e o dia.', true);
      const upd = { texto, data, repete: $('#ce-rep', dl).checked, ...deSobre($('#ce-sobre', dl).value) };
      if (upd.repete && !t.repete) upd.ate = null;
      const { data: row, error } = await emFila(t.id, () => tab().update(upd).eq('id', t.id).select().single());
      if (error) return toast(erroAmigavel(error), true);
      Object.assign(t, row); dl.close(); desenhar(); toast('Tarefa atualizada.');
    };
  });
}

async function salvarNota() {
  clearTimeout(C.notaTimer); C.notaTimer = null;
  const p = C.notaPend; if (!p) return;
  C.notaPend = null;
  const st = () => $('#ck-nota-st');
  C.notas[p.d] = p.texto; // o que aparece na tela
  if ((C.salvas[p.d] || '') === p.texto) { if (st()) st().textContent = ''; return; }
  const uid = C.ctx.eu.id;
  const { error } = p.texto.trim()
    ? await sb.from('checklist_notas').upsert({ user_id: uid, data: p.d, texto: p.texto, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id,data' })
    : await sb.from('checklist_notas').delete().eq('user_id', uid).eq('data', p.d);
  if (error) {
    toast(erroAmigavel(error), true);
    if (st()) st().textContent = 'Não salvou. Edite de novo para tentar.';
    return;
  }
  C.salvas[p.d] = p.texto;
  if (st() && C.sel === p.d) {
    st().textContent = 'Salvo';
    setTimeout(() => { if (st()?.textContent === 'Salvo') st().textContent = ''; }, 2000);
  }
}
