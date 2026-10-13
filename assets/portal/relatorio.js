/* =========================================================
   MLX Mind · Relatório mensal (página para ver e salvar em PDF)
   ========================================================= */
import {
  sb, $, esc, dinheiro, dataBR, urlsAssinadas, ehVideo, mesNome, mesCurto, addMeses, cap, num, compacto,
  variacao, METRICAS, STATUS_LEAD, grafico, LOGO
} from './comum.js';

const rel = $('#rel'), btn = $('#pdf');
const id = new URLSearchParams(location.search).get('id');

function erro(t) {
  rel.innerHTML = `<div class="carregando">${t}<br><br><a href="/cliente/">Ir para a área do cliente</a></div>`;
  btn.hidden = true;
}

async function iniciar() {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return erro('Relatório não encontrado.');
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = '/cliente/'; return; }

  const { data: eu } = await sb.from('perfis').select('papel').eq('id', session.user.id).single();
  if (eu?.papel === 'admin') $('#voltar').href = '/admin/';

  const { data: r, error } = await sb.from('relatorios').select('*').eq('id', id).single();
  if (error || !r) return erro('Relatório não encontrado ou ainda não publicado.');
  const ini = addMeses(r.mes, -5), fim = addMeses(r.mes, 1);
  const [conta, metricas, metas, posts, leads, cfg] = await Promise.all([
    sb.from('contas').select('*').eq('id', r.conta_id).single(),
    sb.from('metricas').select('*').eq('conta_id', r.conta_id).gte('mes', ini).lte('mes', r.mes),
    sb.from('metas').select('*').eq('conta_id', r.conta_id).eq('mes', r.mes),
    r.posts_destaque?.length ? sb.from('postagens').select('*').in('id', r.posts_destaque) : Promise.resolve({ data: [] }),
    sb.from('leads').select('*').eq('conta_id', r.conta_id).gte('data', r.mes).lt('data', fim),
    sb.from('configuracoes').select('whatsapp').eq('id', 1).single()
  ]);
  const c = conta.data;
  if (!c) return erro('Não foi possível carregar o relatório.');
  const url = await urlsAssinadas((posts.data || []).map(p => p.midias?.[0]).filter(Boolean));
  document.title = `Relatório ${cap(mesNome(r.mes))} · ${c.nome} | MLX Mind`;
  montar(r, c, metricas.data || [], metas.data || [], posts.data || [], c.modulo_leads ? (leads.data || []) : null, url, cfg.data || {});

  // espera as imagens antes de liberar o PDF
  await Promise.all([...rel.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(ok => { i.onload = i.onerror = ok; })));
  await document.fonts?.ready;
  btn.disabled = false; btn.textContent = 'Baixar PDF';
}
btn.onclick = () => window.print();

function linhas(txt) { return (txt || '').split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean); }

function montar(r, c, metricas, metas, posts, leads, url, cfg) {
  const mes = r.mes, ant = addMeses(mes, -1);
  const doMes = metricas.filter(m => m.mes === mes), doAnt = metricas.filter(m => m.mes === ant);
  const soma = (lista, k) => { const v = lista.map(m => m[k]).filter(x => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + Number(b), 0) : null; };
  const novosSeg = (() => {
    let t = null;
    doMes.forEach(m => { const a = doAnt.find(x => x.rede === m.rede); if (m.seguidores !== null && a?.seguidores !== null && a?.seguidores !== undefined) t = (t || 0) + (m.seguidores - a.seguidores); });
    return t;
  })();
  const inv = soma(doMes, 'investimento'), lds = soma(doMes, 'leads');
  const kpis = [
    ['Alcance', soma(doMes, 'alcance'), soma(doAnt, 'alcance'), compacto],
    ['Visualizações', soma(doMes, 'visualizacoes'), soma(doAnt, 'visualizacoes'), compacto],
    ['Novos seguidores', novosSeg, null, v => (v > 0 ? '+' : '') + num(v)],
    ['Interações', soma(doMes, 'interacoes'), soma(doAnt, 'interacoes'), compacto],
    ['Mensagens', soma(doMes, 'mensagens'), soma(doAnt, 'mensagens'), num],
    ['Leads', lds, soma(doAnt, 'leads'), num],
    ['Investimento', inv, soma(doAnt, 'investimento'), dinheiro, 'neutro'],
    ['Custo por lead', inv && lds ? inv / lds : null, null, dinheiro, true]
  ].filter(k => k[1] !== null);
  const meses = Array.from({ length: 6 }, (_, i) => addMeses(mes, i - 5));
  const redes = [...new Set(doMes.map(m => m.rede))].sort((a, b) => c.redes.indexOf(a) - c.redes.indexOf(b));
  const dest = linhas(r.destaques), prox = linhas(r.proximos_passos);

  const capa = `
  <section class="pg capa">
    <div class="capa-topo">${LOGO}<span><b>MLX</b> Mind</span></div>
    <div class="capa-meio">
      <span class="capa-eyebrow">Relatório mensal</span>
      <h1>${esc(c.nome)}</h1>
      <p class="capa-mes">${esc(cap(mesNome(mes)))}</p>
    </div>
    <div class="capa-rodape"><span>Preparado pela MLX Mind</span><span>mlxmind.com.br</span></div>
  </section>`;

  const visao = `
  <section class="pg">
    <header class="pg-h"><span>${esc(c.nome)} · ${esc(cap(mesNome(mes)))}</span><span>MLX Mind</span></header>
    <h2>Visão geral do mês</h2>
    ${r.resumo ? `<p class="resumo">${esc(r.resumo)}</p>` : ''}
    ${kpis.length ? `<div class="kpis">${kpis.map(([t, v, a, f, invertido]) => {
      const va = variacao(v, a, invertido);
      return `<div class="kpi"><span>${t}</span><strong>${esc(f(v))}</strong>${va ? `<small class="${va.cls}">${va.txt} vs ${esc(mesCurto(ant))}</small>` : '<small>&nbsp;</small>'}</div>`;
    }).join('')}</div>` : '<p class="vazio">Os números deste mês ainda não foram lançados.</p>'}
    ${metas.length ? `<h3>Metas do mês</h3><div class="metas">${metas.map(m => {
      const pct = Math.min(100, Math.round(m.atual / m.alvo * 100)), f = v => m.unidade === 'R$' ? dinheiro(v) : num(v) + (m.unidade ? ' ' + m.unidade : '');
      return `<div class="meta${pct >= 100 ? ' ok' : ''}"><div class="meta-t"><b>${esc(m.titulo)}</b><span>${pct}%</span></div><div class="barra"><i style="width:${pct}%"></i></div><small>${esc(f(m.atual))} de ${esc(f(m.alvo))}</small></div>`;
    }).join('')}</div>` : ''}
    ${dest.length ? `<h3>Destaques</h3><ul class="lista dest">${dest.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
  </section>`;

  const porRede = redes.map(rede => {
    const m = doMes.find(x => x.rede === rede), a = doAnt.find(x => x.rede === rede);
    const defs = METRICAS.filter(d => m[d.k] !== null && m[d.k] !== undefined);
    const serie = k => meses.map(x => ({ r: mesCurto(x), v: metricas.find(y => y.mes === x && y.rede === rede)?.[k] ?? null }));
    const temHist = k => serie(k).filter(p => p.v !== null).length >= 2;
    const graf = ['seguidores', 'alcance', 'leads', 'visualizacoes'].filter(k => m[k] !== null && temHist(k)).slice(0, 2);
    return `<div class="rede">
      <h3>${esc(rede)}</h3>
      <table><thead><tr><th>Métrica</th><th>${esc(mesCurto(mes))}</th><th>${esc(mesCurto(ant))}</th><th>Variação</th></tr></thead>
      <tbody>${defs.map(d => {
        const va = variacao(m[d.k], a?.[d.k], d.k === 'investimento' ? 'neutro' : false);
        const f = v => v === null || v === undefined ? '—' : d.dinheiro ? dinheiro(v) : num(v);
        return `<tr><td>${d.t}</td><td><b>${f(m[d.k])}</b></td><td>${f(a?.[d.k])}</td><td class="${va?.cls || ''}">${va ? va.txt : '—'}</td></tr>`;
      }).join('')}</tbody></table>
      ${graf.length ? `<div class="grafs">${graf.map(k => `<div class="graf-box"><span>${METRICAS.find(d => d.k === k).t} · últimos 6 meses</span>${grafico(serie(k), { tipo: k === 'seguidores' ? 'linha' : 'barras', cor: '#8a2be2', claro: true, altura: 170 })}</div>`).join('')}</div>` : ''}
    </div>`;
  }).join('');
  const redesPg = redes.length ? `
  <section class="pg">
    <header class="pg-h"><span>${esc(c.nome)} · ${esc(cap(mesNome(mes)))}</span><span>MLX Mind</span></header>
    <h2>Resultados por rede</h2>${porRede}
  </section>` : '';

  let leadsPg = '';
  if (leads) {
    const fech = leads.filter(l => l.status === 'fechou'), valor = fech.reduce((s, l) => s + Number(l.valor || 0), 0);
    const porOrigem = {}; leads.forEach(l => { porOrigem[l.origem] = (porOrigem[l.origem] || 0) + 1; });
    leadsPg = `
    <section class="pg">
      <header class="pg-h"><span>${esc(c.nome)} · ${esc(cap(mesNome(mes)))}</span><span>MLX Mind</span></header>
      <h2>Leads e vendas</h2>
      <div class="kpis">
        <div class="kpi"><span>Leads no mês</span><strong>${num(leads.length)}</strong><small>&nbsp;</small></div>
        <div class="kpi"><span>Fecharam</span><strong>${num(fech.length)}</strong><small>${leads.length ? Math.round(fech.length / leads.length * 100) : 0}% de conversão</small></div>
        <div class="kpi"><span>Vendido</span><strong>${valor ? dinheiro(valor) : '—'}</strong><small>&nbsp;</small></div>
      </div>
      ${Object.keys(porOrigem).length ? `<h3>De onde vieram</h3><div class="origens">${Object.entries(porOrigem).sort((a, b) => b[1] - a[1]).map(([o, n]) =>
        `<div class="orig"><span>${esc(o)}</span><div class="barra"><i style="width:${Math.round(n / leads.length * 100)}%"></i></div><b>${n}</b></div>`).join('')}</div>` : ''}
      ${leads.length ? `<h3>Lista</h3><table><thead><tr><th>Data</th><th>Nome</th><th>Origem</th><th>Status</th><th>Valor</th></tr></thead><tbody>
        ${leads.slice(0, 25).map(l => `<tr><td>${dataBR(l.data, { day: '2-digit', month: '2-digit' })}</td><td>${esc(l.nome)}</td><td>${esc(l.origem)}</td><td>${esc(STATUS_LEAD[l.status][0])}</td><td>${l.valor ? dinheiro(l.valor) : '—'}</td></tr>`).join('')}</tbody></table>` : ''}
    </section>`;
  }

  const fotos = posts.filter(p => p.midias?.[0]);
  const final = `
  <section class="pg">
    <header class="pg-h"><span>${esc(c.nome)} · ${esc(cap(mesNome(mes)))}</span><span>MLX Mind</span></header>
    ${fotos.length ? `<h2>Melhores posts do mês</h2><div class="posts">${fotos.map(p => {
      const m = p.midias[0];
      return `<figure>${ehVideo(m) ? `<div class="vid">▶ Vídeo</div>` : `<img src="${esc(url(m))}" alt="">`}<figcaption><b>${esc(p.titulo)}</b><span>${esc(p.formato)} · ${dataBR(p.data_publicacao, { day: '2-digit', month: '2-digit' })}</span></figcaption></figure>`;
    }).join('')}</div>` : ''}
    ${prox.length ? `<h2>Próximos passos</h2><ol class="lista prox">${prox.map(d => `<li>${esc(d)}</li>`).join('')}</ol>` : ''}
    <div class="assinatura">${LOGO}<div><b>MLX Mind</b><span>Marketing, tráfego pago e sites${cfg.whatsapp ? ' · WhatsApp ' + esc(cfg.whatsapp.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3')) : ''} · mlxmind.com.br</span></div></div>
  </section>`;

  rel.innerHTML = capa + visao + redesPg + leadsPg + final;
}

iniciar().catch(e => erro('Erro ao carregar: ' + esc(e.message || e)));
