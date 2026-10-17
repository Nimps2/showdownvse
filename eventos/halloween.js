// eventos/halloween.js — definição e visual do evento "Halloween" (2.º evento do site).
// Cada evento tem o seu par .js/.css (visual dedicado). O motor comum (missões, XP, claims, quadro) está em eventos-core.js; a casca da página em eventos.html.
// Identidade: NOITE DAS ALMAS — uma mansão assombrada sob a lua cheia, abóboras a brilhar, morcegos e fantasmas. Moeda do evento: Doces 🍬.
// Regra do evento: SÓ valem Pokémon com o tipo Dark OU Ghost (lista em EVENT_EXACT_SPECIES, showdown-utils.js). Duas semanas: Noite da Doçura e Noite da Travessura.
(function(){
  const REGION_EMOJI = { halloween:'🎃' };
  const WEEK_NAMES = ['Noite da Doçura', 'Noite da Travessura'];
  const RULE_TXT = 'só valem Pokémon Dark ou Ghost (um dos tipos tem de ser um destes; as formas regionais valem se cumprirem a regra)';

  // XP acumulado necessário para cada nível + cosmético exclusivo desbloqueado.
  // (Os cosméticos estão em COSMETIC_CATALOG, showdown-utils.js, com eventOnly:'halloween'.)
  const LEVELS = [
    { level:1, xp:100,  cosmeticId:'title_hw_doce_trav' },
    { level:2, xp:250,  cosmeticId:'badge_hw_abobora' },
    { level:3, xp:450,  cosmeticId:'bg_hw_noite' },
    { level:4, xp:700,  cosmeticId:'badge_hw_fantasma' },
    { level:5, xp:1000, cosmeticId:'effect_hw_assombrado' },
    { level:6, xp:1400, cosmeticId:'badge_hw_morcego' },
    // 7-8: prestígio de quem também compete (2000 XP > 1980, o máximo de quem nunca ganha nada). Ao acrescentar missões que NÃO exigem vitórias,
    // confirmar que o máximo de quem nunca ganha continua abaixo de 2000 (hoje 1980: folga de 20 XP; conta feita em Backups/test_halloween.py).
    { level:7, xp:2000, cosmeticId:'frame_hw_morcegos' },
    { level:8, xp:2800, cosmeticId:'title_hw_lenda' }
  ];

  // Grupos de missões = "salas da mansão".
  const GROUPS = {
    torneio:    { gate:'A', label:'Torneio',     icon:'🏚️' },
    travessuras:{ gate:'B', label:'Travessuras', icon:'🕸️' },
    mural:      { gate:'C', label:'Mural',       icon:'📜' },
    x1:         { gate:'D', label:'Duelos x1',   icon:'⚔️' }
  };

  // Missões de CADA semana (id final = w<semana>_<key>) e do evento inteiro. (`miles` = Doces: é o nome genérico da moeda do evento no motor.)
  // needs:'x1' | 'board' = só aparecem quando essa parte está ligada. As de "travessuras" e "mural" não exigem ganhar partidas.
  const MISSIONS = {
    weekly: [
      { key:'play',     group:'torneio',     title:'Entrada na mansão',       desc:'Participa no torneio da semana.',                           check:{type:'participate'},               xp:60,  miles:10, coins:5 },
      { key:'win1',     group:'torneio',     title:'Primeiro susto',          desc:'Ganha 1 partida no torneio (desistências não contam).',     check:{type:'wins', target:1},           xp:80,  miles:15, coins:8 },
      { key:'win3',     group:'torneio',     title:'Assombração em série',    desc:'Ganha 3 partidas no torneio.',                              check:{type:'wins', target:3},           xp:120, miles:20, coins:12 },
      { key:'final',    group:'torneio',     title:'Porta da cripta',         desc:'Chega à final do torneio.',                                 check:{type:'final'},                     xp:150, miles:25, coins:15 },
      { key:'champion', group:'torneio',     title:'Soberano da noite',       desc:'Sê o campeão do torneio da semana — e ganha o título de Campeão dessa noite.', check:{type:'champion'},        xp:250, miles:40, coins:30,
        grants:{ 1:'title_hw_campeao_s1', 2:'title_hw_campeao_s2' } },

      { key:'daily3',   group:'travessuras', title:'Visita frequente',        desc:'Reclama o bónus diário 3 vezes esta semana.',               check:{type:'dailyW', target:3},          xp:40,  miles:8,  coins:5 },
      { key:'daily6',   group:'travessuras', title:'Fantasma residente',      desc:'Reclama o bónus diário 6 vezes esta semana.',               check:{type:'dailyW', target:6},          xp:60,  miles:10, coins:8 },
      { key:'gift10',   group:'travessuras', title:'Doçura!',                 desc:'Doa 🪙10 (no total) a outros jogadores esta semana.',        check:{type:'giftSumW', target:10},       xp:40,  miles:8,  coins:0 },
      { key:'gift2',    group:'travessuras', title:'Doces para todos',        desc:'Doa moedas a 2 jogadores diferentes esta semana.',          check:{type:'giftPeopleW', target:2},      xp:40,  miles:8,  coins:0 },
      { key:'bet1',     group:'travessuras', title:'Aposta no escuro',        desc:'Faz 1 palpite numa partida esta semana (não precisas de acertar).', check:{type:'betsW', target:1},     xp:30,  miles:6,  coins:0 },
      { key:'roulette1',group:'travessuras', title:'Roleta maldita',          desc:'Joga uma vez na roleta esta semana.',                       check:{type:'rouletteW', target:1},       xp:25,  miles:5,  coins:0 },

      { key:'post1',    group:'mural',       title:'Recado do além',          desc:'Deixa um recado no mural do evento esta semana.',           check:{type:'postsW', target:1},          xp:30,  miles:6,  coins:3,  needs:'board' },
      { key:'post3',    group:'mural',       title:'Médium assíduo',          desc:'Escreve no mural em 3 dias diferentes esta semana.',        check:{type:'postDaysW', target:3},       xp:50,  miles:8,  coins:5,  needs:'board' },
      { key:'react3',   group:'mural',       title:'Espírito simpático',      desc:'Reage a 3 recados de outros jogadores esta semana.',        check:{type:'reactsW', target:3},         xp:30,  miles:6,  coins:3,  needs:'board' },

      { key:'x1send',   group:'x1',          title:'Desafio lançado',         desc:'Envia um desafio x1.',                                      check:{type:'x1sent'},   needs:'x1',        xp:40,  miles:8,  coins:0 },
      { key:'x1play',   group:'x1',          title:'Duelo na cripta',         desc:'Joga um x1 confirmado.',                                    check:{type:'x1played'}, needs:'x1',        xp:70,  miles:12, coins:5 },
      { key:'x1win',    group:'x1',          title:'Vitória sombria',         desc:'Ganha um x1.',                                              check:{type:'x1wins'},   needs:'x1',        xp:100, miles:15, coins:10 },
      { key:'x1win2',   group:'x1',          title:'Dupla assombração',       desc:'Ganha 2 x1 na mesma semana.',                               check:{type:'x1wins', target:2}, needs:'x1', xp:120, miles:20, coins:12 },
      // "Escadas" de x1: jogar mais continua a compensar (jogar 3 / 5 x1 paga ganhes ou percas; ganhar 3 paga bem mais).
      { key:'x1play3',  group:'x1',          title:'Noite de duelos',         desc:'Joga 3 x1 confirmados na mesma semana.',                    check:{type:'x1played', target:3}, needs:'x1', xp:25,  miles:6,  coins:5 },
      { key:'x1play5',  group:'x1',          title:'Madrugada sem sono',      desc:'Joga 5 x1 confirmados na mesma semana.',                    check:{type:'x1played', target:5}, needs:'x1', xp:35,  miles:10, coins:8 },
      { key:'x1win3',   group:'x1',          title:'Hat-trick fantasma',      desc:'Ganha 3 x1 na mesma semana.',                               check:{type:'x1wins', target:3}, needs:'x1', xp:150, miles:25, coins:15 }
    ],
    event: [
      { id:'g_daily5',    title:'Habitante da mansão',     desc:'Reclama 5 bónus diários durante o evento.',                  check:{type:'dailyBonus', target:5},     xp:80,  miles:12, coins:8 },
      { id:'g_pred',      title:'Vidente das trevas',      desc:'Acerta num palpite de uma partida de um torneio do evento.', check:{type:'prediction'},               xp:60,  miles:10, coins:5 },
      { id:'g_lottery',   title:'Bilhete amaldiçoado',     desc:'Compra 1 bilhete da Loteria durante o evento.',              check:{type:'lottery'},                  xp:30,  miles:5,  coins:0 },
      { id:'g_nick',      title:'Batizado nas trevas',     desc:'Vota no Apelido da Semana durante o evento.',                check:{type:'nickname'},                 xp:30,  miles:5,  coins:0 },
      { id:'g_generous',  title:'Saco de doces',           desc:'Doa 🪙50 no total a outros jogadores durante o evento.',      check:{type:'giftSum', target:50},       xp:100, miles:15, coins:10 },
      { id:'g_postcards', title:'Livro de feitiços',       desc:'Deixa recados no mural em 5 dias diferentes.',               check:{type:'postDays', target:5},       xp:80,  miles:12, coins:8,  needs:'board' },
      { id:'g_loved',     title:'Alma da festa',           desc:'Recebe 5 reações nos teus recados.',                         check:{type:'reactionsReceived', target:5}, xp:80, miles:12, coins:8, needs:'board' },
      { id:'g_alltour',   title:'Noite completa',          desc:'Participa nos 2 torneios do evento.',                        check:{type:'weeksPlayed'},              xp:300, miles:60, coins:50 },
      { id:'g_x1opp4',    title:'Rota dos duelos',         desc:'Joga x1 confirmados contra 4 jogadores diferentes durante o evento.', check:{type:'x1opponents', target:4}, needs:'x1', xp:40,  miles:8,  coins:6 },
      { id:'g_x1play8',   title:'Veterano dos x1',         desc:'Joga 8 x1 confirmados durante o evento.',                    check:{type:'x1playedAll', target:8}, needs:'x1', xp:30,  miles:8,  coins:6 },
      { id:'g_x1win5',    title:'Lenda dos duelos',        desc:'Ganha 5 x1 durante o evento.',                               check:{type:'x1winsAll', target:5},    needs:'x1', xp:200, miles:40, coins:25 }
    ]
  };

  // ---------- Silhueta da mansão assombrada (SVG inline, viewBox 600x120) ----------
  const SKYLINE = `<rect x="165" y="70" width="270" height="50"/><polygon points="155,72 300,40 445,72"/>
      <rect x="266" y="30" width="68" height="46"/><polygon points="258,32 300,4 342,32"/><rect x="299" y="0" width="2" height="8"/>
      <rect x="186" y="54" width="28" height="22"/><polygon points="180,54 200,34 220,54"/><rect x="386" y="54" width="28" height="22"/><polygon points="380,54 400,34 420,54"/>
      <rect x="470" y="90" width="22" height="30"/><polygon points="466,90 481,76 496,90"/><rect x="108" y="92" width="20" height="28"/><polygon points="104,92 118,80 132,92"/>
      <polygon points="48,120 53,64 58,120"/><polygon points="53,92 36,72 38,70 55,86"/><polygon points="53,80 70,62 72,64 55,86"/><polygon points="53,70 46,52 49,51 55,66"/>
      <polygon points="548,120 553,70 558,120"/><polygon points="553,96 538,80 540,78 555,90"/><polygon points="553,84 570,68 572,70 555,92"/>
      <rect class="hw-win" x="292" y="42" width="16" height="22"/><rect class="hw-win" x="198" y="86" width="12" height="16"/><rect class="hw-win" x="232" y="86" width="12" height="16"/>
      <rect class="hw-win" x="356" y="86" width="12" height="16"/><rect class="hw-win" x="392" y="86" width="12" height="16"/><rect class="hw-win" x="194" y="60" width="12" height="12"/>
      <rect class="hw-win" x="394" y="60" width="12" height="12"/><rect class="hw-win" x="477" y="100" width="8" height="10"/>
      <polygon points="82,38 90,30 98,38 94,34 90,40 86,34"/><polygon points="500,30 508,22 516,30 512,26 508,32 504,26"/><polygon points="420,18 426,12 432,18 429,15 426,19 423,15"/>`;

  // ---------- Pré-visualização de um cosmético (para as etiquetas de nível) ----------
  // Se o catálogo (showdown-utils.js em cache) não conhecer o prémio, mostra algo legível em vez do código em bruto.
  function cosmeticName(id){
    const c = getCosmeticById(id);
    if(c) return c.name;
    const lv = LEVELS.find(l => l.cosmeticId === id);
    return lv ? `Prémio do nível ${lv.level}` : 'Prémio do evento';
  }
  function cosmeticPreview(id){
    const c = getCosmeticById(id);
    if(!c) return '';
    const cat = findCosmeticCategory(id);
    if(cat === 'badges')      return `<span class="hw-prev-emoji">${c.emoji}</span>`;
    if(cat === 'titles')      return `<span class="hw-prev-text">${escapeHtml(c.text)}</span>`;
    if(cat === 'frames')      return frameEffectPreviewHtml(c.effect);
    if(cat === 'nameEffects') return `<span class="hw-prev-name ${nameFxClass(c)}">Abc</span>`;
    if(cat === 'backgrounds') return `<div class="shop-swatch" style="background:${c.css};"></div>`;
    if(cat === 'accents')     return `<div class="shop-swatch" style="background:${c.color};"></div>`;
    return '';
  }

  const safeId = s => String(s).replace(/[^a-zA-Z0-9_-]/g, '');
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Separador 1: Mansão ----------
  const plaque = (k, v, glow) => `<div class="hw-plaque"><div class="hw-plaque-k">${k}</div><div class="hw-plaque-v${glow ? ' glow' : ''}">${escapeHtml(v)}</div></div>`;

  function renderMansao(ctx, api){
    const ev = ctx.ev, cur = ev.current_week;
    const ended = ev.status !== 'active';
    const estado = cur === 0 ? 'A ABRIR' : (ended ? 'ENCERRADO' : 'A DECORRER');
    const rule = cur > 0
      ? `📜 <b>${WEEK_NAMES[Math.min(cur, WEEK_NAMES.length) - 1]} (semana ${cur}):</b> ${RULE_TXT}. Vale para o torneio e para os x1.`
      : '📜 O evento arranca com o torneio da Semana 1. Fica atento — e vai preparando um time só com Dark e Ghost!';
    return `
    <section class="hw-hero${api.ui.intro ? ' intro' : ''}" data-region="halloween">
      <svg class="hw-skyline" viewBox="0 0 600 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${SKYLINE}</svg>
      <div class="hw-hero-inner">
        <div class="hw-cover-top">
          <span class="hw-globe" aria-hidden="true">🎃</span>
          <div>
            <div class="hw-kicker">Noite das Almas · Edição ${new Date(ev.starts_at || Date.now()).getUTCFullYear()}</div>
            <h2 class="hw-title">Halloween</h2>
          </div>
        </div>
        <div class="hw-holder">Convidado: <b>${escapeHtml(ctx.me)}</b></div>
        <div class="hw-plaques" role="group" aria-label="Estado do evento">
          ${plaque('SEMANA', `${Math.max(cur, 0)} / ${ev.total_weeks}`)}
          ${plaque('ESTADO', estado)}
          ${plaque('REGRA', 'DARK + GHOST', true)}
        </div>
        <div class="hw-rule">${rule}</div>
      </div>
    </section>
    <section class="hw-section">${levelsHtml(ctx)}</section>
    <section class="hw-section hw-ranking"><h3 class="hw-h3">🏆 Ranking do evento</h3>${rankingHtml(ctx, api)}</section>
    ${api.x1On ? '' : `<div class="hw-soon">⚔️ Os desafios x1 (até ${EventCore.x1.MAX_PER_WEEK} por semana) chegam em breve — vão trazer mais missões.</div>`}`;
  }

  function rankingHtml(ctx){
    const rows = EventCore.ranking(ctx).slice(0, 10);
    if(!rows.length) return '<div class="empty-state">Ainda ninguém reclamou missões. Sê o primeiro a assustar!</div>';
    return rows.map((r, i) => {
      const lv = EventCore.levelFor(mod, r.xp).level;
      const medal = ['🥇','🥈','🥉'][i] || (i + 1);
      return `<div class="hw-rank-row${r.name === ctx.me ? ' me' : ''}">
        <span class="hw-rank-pos">${medal}</span>
        <span class="hw-rank-name">${escapeHtml(r.name)}</span>
        <span class="hw-rank-lvl">Nível ${lv}</span>
        <span class="hw-rank-xp">${r.xp} XP</span>
      </div>`;
    }).join('');
  }

  // ---------- Balde de doces: XP + etiquetas dos prémios ----------
  function levelsHtml(ctx){
    const t = EventCore.totals(ctx, ctx.me);
    const lv = EventCore.levelFor(mod, t.xp);
    const n = mod.levels.length;
    const frac = Math.min(1, (lv.level + (lv.max ? 0 : lv.pct / 100)) / n);
    const nextTxt = lv.next
      ? `Próximo prémio: <b>${escapeHtml(cosmeticName(lv.next.cosmeticId))}</b> — faltam ${lv.next.xp - t.xp} XP`
      : 'Chegaste ao nível máximo! 🎉';
    const tags = mod.levels.map((l, i) => {
      const state = l.level <= lv.level ? 'unlocked' : (l.level === lv.level + 1 ? 'next' : 'locked');
      return `<div class="hw-tag ${state}" style="--d:${(i * 0.37).toFixed(2)}s">
        <span class="hw-tag-loop"></span>
        <div class="hw-tag-lvl">Nível ${l.level}</div>
        <div class="hw-tag-prev">${cosmeticPreview(l.cosmeticId)}</div>
        <div class="hw-tag-name">${escapeHtml(cosmeticName(l.cosmeticId))}</div>
        <div class="hw-tag-xp">${state === 'unlocked' ? '✔ desbloqueado' : l.xp + ' XP'}</div>
      </div>`;
    }).join('');
    return `<div class="hw-xp">
      <div class="hw-xp-top">
        <span class="hw-xp-level">Nível ${lv.level}</span>
        <span class="hw-xp-num">${t.xp} XP${lv.next ? ' / ' + lv.next.xp : ''}</span>
        <span class="hw-xp-miles" title="${t.miles} ganhos${t.spent ? ' · ' + t.spent + ' gastos na loja' : ''}">${mod.currency.emoji} ${t.balance} ${mod.currency.name}</span>
      </div>
      <div class="hw-bar"><div style="width:${lv.pct}%"></div></div>
      <div class="hw-xp-next">${nextTxt}</div>
    </div>
    <div class="hw-log" style="--frac:${frac};--n:${n};--minw:${n * 114}px">
      <div class="hw-log-scroll">
        <div class="hw-log-track"><i></i><span class="hw-log-plane">🎃</span></div>
        <div class="hw-tags">${tags}</div>
      </div>
    </div>`;
  }

  // ---------- Separador 2: Missões (cartões da noite) ----------
  function passHtml(m, ctx, api, idx){
    const st = EventCore.evaluate(ctx, m);
    const pct = st.target ? Math.round((st.value / st.target) * 100) : 0;
    const g = GROUPS[m.group] || GROUPS.torneio;
    const sid = safeId(m.id);
    let action;
    if(m.locked) action = '<span class="hw-pass-lock">🔒 por abrir</span>';
    else if(st.claimed) action = `<span class="hw-claimed${api.ui.justClaimed === m.id ? ' slam' : ''}">Reclamada</span>`;
    else if(st.done) action = `<button class="hw-claim" onclick="doClaim('${sid}', this)">Reclamar</button>`;
    else action = `<span class="hw-pass-prog">${st.value}/${st.target}</span>`;
    const code = (m.scope === 'week' ? `W${m.week}` : 'EV') + '·' + String(idx).padStart(2, '0');
    return `<div class="hw-pass${st.claimed ? ' claimed' : ''}${st.done && !st.claimed && !m.locked ? ' ready' : ''}${m.locked ? ' locked' : ''}" data-grp="${m.group || 'torneio'}" data-mid="${sid}">
      <div class="hw-pass-main">
        <div class="hw-pass-top"><span class="hw-pass-code">${code}</span><span class="hw-pass-grp">${g.icon} ${g.label}</span></div>
        <div class="hw-pass-title">${escapeHtml(m.title)}</div>
        <div class="hw-pass-desc">${escapeHtml(m.desc)}</div>
        ${!st.claimed && !m.locked ? `<div class="hw-pass-bar"><i style="width:${pct}%"></i></div>` : ''}
      </div>
      <div class="hw-pass-stub">
        <div class="hw-pass-rewards">
          <span>+${m.xp} XP</span><span>${mod.currency.emoji} ${m.miles}</span>${m.coins ? `<span>🪙 ${m.coins}</span>` : ''}
        </div>
        <div class="hw-pass-action">${action}</div>
        <div class="hw-barcode" aria-hidden="true"></div>
      </div>
    </div>`;
  }

  function weekMissionsHtml(ctx, api, all, week){
    const w = mod.weeks[week - 1], r = EVENT_REGIONS[w.region];
    const list = all.filter(m => m.scope === 'week' && m.week === week);
    if(!list.length) return '';
    const locked = week > ctx.ev.current_week;
    const key = 'w' + week;
    const isOpen = api.ui.open[key] !== undefined ? api.ui.open[key] : (week === ctx.ev.current_week);
    const ready = list.filter(m => { const s = EventCore.evaluate(ctx, m); return s.done && !s.claimed && !m.locked; }).length;
    const groups = Object.keys(GROUPS).map(gk => {
      const items = list.filter(m => (m.group || 'torneio') === gk);
      if(!items.length) return '';
      const g = GROUPS[gk];
      return `<div class="hw-gate"><div class="hw-gate-head"><span class="hw-gate-sign">${g.gate}</span><span class="hw-gate-name">${g.icon} ${g.label}</span></div>
        ${items.map((m, i) => passHtml(m, ctx, api, i + 1)).join('')}</div>`;
    }).join('');
    return `<details class="hw-week${locked ? ' locked' : ''}" data-region="${w.region}" ${isOpen ? 'open' : ''} ontoggle="evToggle('${key}', this.open)">
      <summary class="hw-week-head">
        <span class="hw-wh-emoji">${REGION_EMOJI[w.region]}</span>
        <span class="hw-wh-text"><b>Semana ${week} — ${WEEK_NAMES[week - 1] || r.label}</b><small>${r.dex}</small></span>
        ${ready ? `<span class="hw-wh-ready">${ready} por reclamar</span>` : ''}
        <span class="hw-wh-pill">${locked ? '🔒 abre com o torneio da semana' : (week === ctx.ev.current_week ? '🎃 semana atual' : 'encerrada')}</span>
        <span class="hw-wh-chev" aria-hidden="true">▾</span>
      </summary>
      <div class="hw-week-body">${locked ? '' : groups}${locked ? '<div class="hw-locked-note">As missões desta semana abrem quando o torneio da semana for criado.</div>' : ''}</div>
    </details>`;
  }

  function renderMissions(ctx, api){
    const all = EventCore.expandMissions(mod, ctx.ev, { x1: api.x1On }, ctx);
    const nReady = all.filter(m => { const s = EventCore.evaluate(ctx, m); return s.done && !s.claimed && !m.locked; }).length;
    let html = nReady ? `<div class="hw-claimall"><button type="button" class="hw-claim" onclick="doClaimAll(this)">🎁 Coletar todas as recompensas (${nReady})</button></div>` : '';
    mod.weeks.forEach((w, i) => { html += weekMissionsHtml(ctx, api, all, i + 1); });
    const ev = all.filter(m => m.scope === 'event');
    const evReady = ev.filter(m => { const s = EventCore.evaluate(ctx, m); return s.done && !s.claimed && !m.locked; }).length;
    const isOpen = api.ui.open.ev !== undefined ? api.ui.open.ev : false;
    html += `<details class="hw-week hw-week-event" ${isOpen ? 'open' : ''} ontoggle="evToggle('ev', this.open)">
      <summary class="hw-week-head">
        <span class="hw-wh-emoji">🕸️</span>
        <span class="hw-wh-text"><b>Missões do evento</b><small>valem durante todo o evento</small></span>
        ${evReady ? `<span class="hw-wh-ready">${evReady} por reclamar</span>` : ''}
        <span class="hw-wh-chev" aria-hidden="true">▾</span>
      </summary>
      <div class="hw-week-body"><div class="hw-gate">${ev.map((m, i) => passHtml(m, ctx, api, i + 1)).join('')}</div></div>
    </details>`;
    return html;
  }

  // ---------- Separador 4: Desafios x1 ----------
  const X1_STATUS = {
    pending:   { label:'À espera de resposta', step:0 }, accepted:  { label:'Aceite — joguem e registem o resultado', step:1 },
    reported:  { label:'Resultado registado — falta confirmar', step:2 }, confirmed: { label:'Confirmado', step:3 },
    disputed:  { label:'Contestado — decide o organizador', step:2 }, resolved:  { label:'Resolvido pelo organizador', step:3 },
    declined:  { label:'Recusado', step:-1 }, cancelled: { label:'Cancelado', step:-1 }
  };
  const STEPS = ['Enviado', 'Aceite', 'Resultado', 'Confirmado'];
  const X1_BTN = {
    accept:  { cls:'go',   text:'✔ Aceitar' },   decline: { cls:'no',   text:'✖ Recusar' },    cancel:  { cls:'no',   text:'Cancelar desafio' },
    win:     { cls:'go',   text:'🏆 Eu ganhei' }, lose:    { cls:'',     text:'Eu perdi' }, score:   { cls:'go',   text:'✔ Registar resultado' },
    confirm: { cls:'go',   text:'✔ Confirmar resultado' }, dispute: { cls:'no', text:'⚠ Contestar' }
  };

  // Painel "Times" de um duelo: o time de cada um (sprites + nomes), importar o teu (validado) e exportar. Só depois de o desafio ser aceite.
  // Times livres numa série (melhor de 3/5): um time POR JOGO — botões "Jogo 1…N" escolhem o jogo a ver/importar/exportar.
  const TEAM_STATES = ['accepted', 'reported', 'disputed', 'confirmed', 'resolved'];
  function teamsHtml(r, ctx, api, sid, regionKey){
    if(!TEAM_STATES.includes(r.status)) return '';
    const X = EventCore.x1;
    const mode = r.team_mode || 'free', perGame = X.perGame(r), games = X.gameCount(r), meKey = X.teamKey(r, ctx.me);
    api.ui.x1Game = api.ui.x1Game || {};
    let game = 1;
    if(perGame){                    // o jogo que escolheste; senão o primeiro em que ainda não tens time
      const firstMissing = meKey ? Array.from({ length: games }, (_, i) => i + 1).find(g => !X.teamOf(r, meKey, g)) : null;
      game = Math.min(Math.max(api.ui.x1Game[sid] || firstMissing || 1, 1), games);
    }
    const revealed = X.teamsRevealed(r, game), where = perGame ? ' neste jogo' : '';
    const side = (key, name) => {
      const team = X.teamOf(r, key, game), mine = key === meKey;
      let body;
      if(!team) body = `<span class="hw-team-empty">${mode === 'random' ? 'sorteio por fazer' : 'ainda sem time registado' + where}</span>`;
      else if(!mine && !revealed) body = `<span class="hw-team-empty">🔒 revela-se quando os dois tiverem o time${where} registado</span>`;
      else body = team.map(m => `<span class="hw-mon">${pokeSpriteHtml(m.name, 32)}<em>${escapeHtml(m.name)}</em></span>`).join('');
      const hasSets = team && (mine || revealed) && team.some(m => m.text && m.text.trim());
      const exp = team && (mine || revealed) ? `<button class="hw-x1btn" onclick="doX1TeamExport('${sid}','${key}',${game})">📤 Exportar${hasSets ? '' : ' (só os nomes)'}</button>` : '';
      return `<div class="hw-team-side${mine ? ' me' : ''}"><div class="hw-team-who"><b>${escapeHtml(name)}${mine ? ' (tu)' : ''}</b>${exp}</div><div class="hw-team-mons">${body}</div></div>`;
    };
    const canImport = meKey && ['accepted', 'reported', 'disputed'].includes(r.status);
    const own = meKey ? X.teamOf(r, meKey, game) : null;
    const hint = mode === 'random'
      ? 'Times <b>aleatórios</b>: o sistema sorteou 6 Pokémon Dark ou Ghost para cada um. Para importar, cola os 6 sets destes Pokémon (podes mudar golpes, item, etc.; a lista tem de ser exatamente a sorteada).'
      : (perGame
        ? `Times <b>livres, um por jogo</b>: em cada jogo da série (melhor de ${games}) podes levar um time diferente. Escolhe o jogo em baixo e importa o time desse jogo (6 Pokémon Dark ou Ghost, sem repetir espécies no mesmo time). O time do adversário em cada jogo só aparece quando os dois tiverem registado o time desse jogo.`
        : 'Times <b>livres</b>: cada um leva os seus 6 (só Dark ou Ghost, sem repetir espécies). O time do adversário só aparece quando os dois tiverem registado o seu.');
    const tabs = perGame ? `<div class="hw-game-tabs">${Array.from({ length: games }, (_, i) => i + 1).map(g => {
      const cnt = (X.teamOf(r, 'team_challenger', g) ? 1 : 0) + (X.teamOf(r, 'team_opponent', g) ? 1 : 0);
      return `<button class="hw-game-tab${g === game ? ' on' : ''}${cnt === 2 ? ' full' : ''}" onclick="doX1Game('${sid}',${g})" title="Jogo ${g}: ${cnt}/2 times registados">Jogo ${g}<small>${cnt}/2</small></button>`;
    }).join('')}</div>` : '';
    const importBox = canImport ? `<div class="hw-team-import">
        <textarea id="x1tm-${sid}" rows="6" placeholder="Cola aqui o time${perGame ? ' do jogo ' + game : ''} exportado do Showdown (os 6 Pokémon separados por uma linha em branco)"></textarea>
        <button class="hw-x1btn go" onclick="doX1TeamSave('${sid}', this, ${game})">📥 ${own ? 'Substituir' : 'Importar'} o meu time${perGame ? ' do jogo ' + game : ''}</button>
      </div>` : '';
    const key = 'teams-' + sid, open = api.ui.open[key] !== undefined ? api.ui.open[key] : (!!meKey && !own && ['accepted'].includes(r.status));
    const n = [X.teamOf(r, 'team_challenger', game), X.teamOf(r, 'team_opponent', game)].filter(Boolean).length;
    return `<details class="hw-teams"${open ? ' open' : ''} ontoggle="evToggle('${key}', this.open)">
      <summary>👥 Times <small>${X.teamModeLabel(mode)} · ${perGame ? 'Jogo ' + game + ': ' : ''}${n}/2 registados</small></summary>
      <div class="hw-teams-hint">${hint}</div>
      ${tabs}
      <div class="hw-teams-grid">${side('team_challenger', r.challenger_name)}${side('team_opponent', r.opponent_name)}</div>
      ${importBox}
    </details>`;
  }

  // O que aconteceu às moedas de um duelo com aposta (as regras estão na base: o vencedor leva os dois valores; recusado, cancelado ou anulado devolve).
  function stakeLine(r){
    if(!(r.stake > 0)) return '';
    const w = EventCore.x1.winnerOf(r), done = r.status === 'confirmed' || r.status === 'resolved';
    if(done && w) return `<div class="hw-duel-verdict soft">🪙 <b>${escapeHtml(w)}</b> levou os 🪙${2 * r.stake} da aposta</div>`;
    if((done && !w) || r.status === 'declined' || r.status === 'cancelled') return `<div class="hw-duel-verdict soft">🪙 Aposta devolvida (🪙${r.stake} a cada um)</div>`;
    if(r.status === 'pending') return `<div class="hw-duel-verdict soft">🪙 Aposta de ${r.stake}: ${escapeHtml(r.challenger_name)} já deixou o valor retido; o adversário só o deixa se aceitar</div>`;
    return `<div class="hw-duel-verdict soft">🪙 Retidos: 🪙${r.stake} de cada um (o vencedor leva 🪙${2 * r.stake})</div>`;
  }

  function duelHtml(r, ctx, api){
    const st = X1_STATUS[r.status] || { label: r.status, step: 0 };
    const w = EventCore.x1.winnerOf(r);
    const acts = EventCore.x1.actionsFor(ctx, r);
    const region = r.week >= 1 && r.week <= mod.weeks.length ? (WEEK_NAMES[r.week - 1] || '') : '';
    const bestOf = r.best_of || 1, hasScore = r.score_challenger != null && r.score_opponent != null;
    const scoreOf = name => hasScore ? (name === r.challenger_name ? r.score_challenger : r.score_opponent) : null;
    const side = name => `<div class="hw-duel-p${w === name && (r.status === 'confirmed' || r.status === 'resolved') ? ' win' : ''}${name === ctx.me ? ' me' : ''}"><b>${escapeHtml(name)}</b><small>${name === r.challenger_name ? 'desafiante' : 'adversário'}</small>${scoreOf(name) !== null ? `<span class="hw-duel-sc">${scoreOf(name)}</span>` : ''}</div>`;
    const steps = STEPS.map((t, i) => `<li class="${st.step < 0 ? 'x' : (i <= st.step ? 'on' : '')}${i === st.step && st.step >= 0 ? ' cur' : ''}">${t}</li>`).join('');
    const sid = String(r.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const scoreTxt = hasScore ? ` <span class="hw-duel-score-txt">(${r.score_challenger}–${r.score_opponent})</span>` : '';
    const verdict = (r.status === 'confirmed' || r.status === 'resolved')
      ? (w ? `<div class="hw-duel-verdict">🏆 Vitória de <b>${escapeHtml(w)}</b>${scoreTxt}</div>` : '<div class="hw-duel-verdict">Anulado pelo organizador</div>')
      : (r.status === 'reported' && w ? `<div class="hw-duel-verdict soft">${escapeHtml(r.reported_by)} registou: vitória de <b>${escapeHtml(w)}</b>${scoreTxt}</div>` : '');
    const links = EventCore.x1.replayLinks(r), canSee = ['reported', 'confirmed', 'resolved'].includes(r.status);
    const replay = links.length && canSee
      ? `<div class="hw-duel-replays">${links.map((l, i) => `<a class="hw-duel-replay" href="${encodeURI(l).replace(/"/g, '%22')}" target="_blank" rel="noopener" onclick="return openReplayModal(this, event)">▶ ${links.length > 1 ? 'Jogo ' + (i + 1) : 'Ver replay'}</a>`).join('')}</div>` : '';
    const isPlayer = r.challenger_name === ctx.me || r.opponent_name === ctx.me;
    // Em melhor de 3/5 o resultado é um placar (em vez de "Eu ganhei"/"Eu perdi"): lista de resultados possíveis do ponto de vista de quem regista.
    const useScore = bestOf > 1 && acts.includes('win');
    const shownActs = useScore ? acts.filter(a => a !== 'win' && a !== 'lose').concat(['score']) : acts;
    const scoreSelect = useScore
      ? `<select class="hw-x1score" id="x1sc-${sid}"><option value="">— resultado final (melhor de ${bestOf}) —</option>${EventCore.x1.scoreOptions(r).map(o => `<option value="${o.value}">${o.label}</option>`).join('')}</select>` : '';
    // Antes de registar o resultado: campo opcional para colar o(s) link(s) do replay do Showdown (um por jogo, em melhor de 3/5).
    const replayField = acts.includes('win')
      ? `<input type="text" class="hw-x1replay" id="x1rp-${sid}" placeholder="${bestOf > 1 ? `Links dos replays (opcional, até ${bestOf}, separados por espaço) — replay.pokemonshowdown.com/…` : 'Link do replay (opcional) — «Upload and share replay» → replay.pokemonshowdown.com/…'}">` : '';
    // Depois: quem jogou ainda pode juntar links de replays se faltarem (até ao nº de jogos do formato).
    const replayAdd = isPlayer && links.length < bestOf && canSee
      ? `<div class="hw-x1replay-row"><input type="text" class="hw-x1replay" id="x1rp-${sid}" placeholder="${bestOf > 1 ? `Juntar link(s) de replay (${links.length}/${bestOf})` : 'Juntar o link do replay (replay.pokemonshowdown.com/…)'}"><button class="hw-x1btn" onclick="doX1Replay('${sid}',this)">Juntar replay</button></div>` : '';
    // Colaste o replay errado? Quem jogou pode trocar (ou tirar) os links já guardados; o campo vem preenchido com os atuais.
    const replayEdit = isPlayer && links.length && canSee && EventCore.x1.canEditReplays(r)
      ? `<details class="hw-x1replay-edit"><summary>✏️ Alterar replay${links.length > 1 ? 's' : ''}</summary>
          <div class="hw-x1replay-row"><input type="text" class="hw-x1replay" id="x1re-${sid}" value="${escapeHtml(links.join(' ')).replace(/"/g, '&quot;')}" placeholder="${bestOf > 1 ? 'Links dos replays (um por jogo, separados por espaço)' : 'Link do replay (replay.pokemonshowdown.com/…)'}">
            <button class="hw-x1btn" onclick="doX1ReplayEdit('${sid}',this)">Guardar</button>
            <button class="hw-x1btn no" onclick="doX1ReplayEdit('${sid}',this,true)">Tirar</button></div>
          <small>Os links novos <b>substituem</b> os antigos. «Tirar» apaga o replay deste duelo (podes juntar outro depois).</small></details>` : '';
    const modeKey = r.team_mode || 'free';
    const fmt =`<span class="hw-duel-fmt${bestOf > 1 ? ' long' : ''}" title="Melhor de ${bestOf}: ganha quem chegar primeiro a ${EventCore.x1.winsNeeded(bestOf)} vitória${EventCore.x1.winsNeeded(bestOf) > 1 ? 's' : ''}">${EventCore.x1.formatLabel(bestOf)}</span>`
      + (r.stake > 0 ? `<span class="hw-duel-fmt long" title="Cada um aposta 🪙${r.stake}; o vencedor leva 🪙${2 * r.stake}">🪙 ${r.stake} em jogo</span>` : '')
      + `<span class="hw-duel-fmt${modeKey === 'random' ? ' long' : ''}" title="${modeKey === 'random' ? 'Times aleatórios: o sistema sorteia 6 Pokémon Dark/Ghost para cada um ao aceitar' : 'Times livres: cada um leva os seus 6 Pokémon Dark/Ghost'}">${EventCore.x1.teamModeLabel(modeKey)}</span>`;
    const regionKey = r.week >= 1 && r.week <= mod.weeks.length ? mod.weeks[r.week - 1].region : null;
    return `<div class="hw-duel s-${r.status}${acts.length ? ' mine' : ''}">
      <div class="hw-duel-top"><span>⚔️ Semana ${r.week}${region ? ' · ' + region : ''} ${fmt}</span><span class="hw-duel-status">${st.label}</span></div>
      <div class="hw-duel-vs">${side(r.challenger_name)}<span class="hw-duel-x">VS</span>${side(r.opponent_name)}</div>
      <ol class="hw-steps">${steps}</ol>
      ${verdict}${stakeLine(r)}${r.status === 'disputed' && r.note ? `<div class="hw-duel-note">“${escapeHtml(r.note)}”</div>` : ''}
      ${teamsHtml(r, ctx, api, sid, regionKey)}
      ${scoreSelect}${replayField}
      ${shownActs.length ? `<div class="hw-duel-actions">${shownActs.map(a => `<button class="hw-x1btn ${X1_BTN[a].cls}" onclick="doX1Act('${sid}','${a}',this)">${X1_BTN[a].text}</button>`).join('')}</div>` : ''}
      ${replay}${replayAdd}${replayEdit}
    </div>`;
  }

  function renderX1(ctx, api){
    const cur = ctx.ev.current_week;
    const intro = `<div class="hw-board-intro"><h3 class="hw-h3">⚔️ Duelos na cripta</h3>
      <p>Desafia outro convidado para um x1 no Showdown. <b>Só valem Pokémon Dark ou Ghost.</b> Quem desafia escolhe o formato (<b>melhor de 1, 3 ou 5</b>). Combinem o jogo, e depois <b>registem o resultado aqui</b> (quem jogou regista, com o placar nos melhores de 3 e 5; o outro confirma). Ao registar, podes <b>colar o link do replay</b> do Showdown (<i>Upload and share replay</i>; um por jogo) — assim fica guardado e toda a gente o pode ver.</p></div>`;
    if(cur < 1) return intro + '<div class="hw-wall-empty">Os desafios abrem com o torneio da Semana 1.</div>';
    // Corrida ao título exclusivo "Rei dos Duelos" (mais vitórias em x1 confirmados no evento; o organizador atribui o título no fim).
    const medals = ['🥇', '🥈', '🥉'], lead = EventCore.x1.leaders(ctx).slice(0, 5);
    const kings = `<section class="hw-section hw-ranking"><h3 class="hw-h3">👑 Corrida ao Rei dos Duelos Sombrios</h3>
      <p class="hw-kings-note">Quem tiver mais vitórias em x1 no fim do evento recebe o título exclusivo <b>👑 Rei dos Duelos Sombrios</b> (empate: decide o organizador). Contam os x1 confirmados de todas as semanas.</p>
      ${lead.length ? lead.map((r2, i) => `<div class="hw-rank-row${r2.name === ctx.me ? ' me' : ''}"><span class="hw-rank-pos">${medals[i] || (i + 1)}</span><span class="hw-rank-name">${escapeHtml(r2.name)}</span><span class="hw-rank-lvl">${r2.played} x1</span><span class="hw-rank-xp">${r2.wins} vitória${r2.wins === 1 ? '' : 's'}</span></div>`).join('')
        : '<div class="hw-wall-empty">Ainda ninguém tem x1 confirmados. Sê o primeiro!</div>'}</section>`;
    const q = EventCore.x1.quota(ctx);
    const names = (ctx.playerNames || []).filter(n => n !== ctx.me).sort((a, b) => a.localeCompare(b));
    const opts = '<option value="">— escolhe o adversário —</option>' + names.map(n =>
      `<option value="${escapeHtml(n).replace(/"/g, '&quot;')}"${q.opponents.has(n) ? ' disabled' : ''}>${escapeHtml(n)}${q.opponents.has(n) ? ' (já desafiado)' : ''}</option>`).join('');
    const send = `<div class="hw-x1send">
      <div class="hw-x1send-top"><b>Novo desafio</b><span class="hw-x1quota${q.left === 0 ? ' full' : ''}">${q.used}/${q.max} esta semana</span></div>
      <div class="hw-x1send-row"><select id="x1Opponent" ${q.left === 0 ? 'disabled' : ''}>${opts}</select>
        <select id="x1Format" class="hw-x1format" title="Formato do duelo" onchange="ui.x1Format=+this.value" ${q.left === 0 ? 'disabled' : ''}>${EventCore.x1.FORMATS.map(b => `<option value="${b}"${(api.ui.x1Format || 1) === b ? ' selected' : ''}>Melhor de ${b} (${EventCore.x1.formatLabel(b)})</option>`).join('')}</select>
        <select id="x1Teams" class="hw-x1format" title="Times do duelo" onchange="ui.x1Teams=this.value" ${q.left === 0 ? 'disabled' : ''}>
          <option value="free"${(api.ui.x1Teams || 'free') === 'free' ? ' selected' : ''}>✋ Times livres (cada um leva os seus 6)</option>
          <option value="random"${api.ui.x1Teams === 'random' ? ' selected' : ''}>🎲 Times aleatórios (sorteio de 6 para cada um)</option></select>
        <select id="x1Stake" class="hw-x1format" title="Aposta opcional: cada um deixa este valor retido e o vencedor leva os dois" onchange="ui.x1Stake=+this.value" ${q.left === 0 ? 'disabled' : ''}>
          <option value="0"${!api.ui.x1Stake ? ' selected' : ''}>🪙 Sem aposta</option>${EventCore.x1.STAKES.map(v => `<option value="${v}"${api.ui.x1Stake === v ? ' selected' : ''}>🪙 Aposta ${v} (o vencedor leva ${2 * v})</option>`).join('')}</select>
        <button class="hw-send" onclick="doX1Send(this)" ${q.left === 0 ? 'disabled' : ''}>⚔️ Desafiar</button></div>
      ${q.left === 0 ? `<small>Já enviaste os ${q.max} desafios desta semana — voltas a poder na próxima.</small>` : `<small>Máximo ${q.max} desafios enviados por semana, a jogadores diferentes. Recusados e cancelados não contam. Tu escolhes o formato (md1, md3 ou md5: ganha quem chegar primeiro a 1, 2 ou 3 vitórias); o adversário pode aceitar ou recusar. Escolhes também os <b>times</b>: livres, ou aleatórios (o sistema sorteia 6 Pokémon da região para cada um quando o adversário aceita). Um duelo conta como UM x1 nas missões, seja qual for o formato.</small>`}
      <small style="display:block;margin-top:6px;">🪙 <b>Apostas (opcional):</b> quem desafia escolhe o valor e ele fica retido; o adversário só o deixa retido se aceitar. Quem ganhar leva os dois valores (ganha o que o outro perde — as moedas só trocam de mãos). Se o desafio for recusado, cancelado ou anulado pelo organizador, devolve-se tudo a cada um.</small>
    </div>`;
    const rows = ctx.x1;
    const forMe = rows.filter(r2 => (r2.status === 'pending' && r2.opponent_name === ctx.me) || (r2.status === 'reported' && r2.reported_by !== ctx.me && (r2.challenger_name === ctx.me || r2.opponent_name === ctx.me)));
    const forMeIds = new Set(forMe.map(r2 => r2.id));
    const ongoing = rows.filter(r2 => !forMeIds.has(r2.id) && ['pending', 'accepted', 'reported', 'disputed'].includes(r2.status));
    const done = rows.filter(r2 => ['confirmed', 'resolved', 'declined', 'cancelled'].includes(r2.status));
    const sect = (title, list, empty) => `<h3 class="hw-h3">${title}</h3>` + (list.length ? `<div class="hw-duels">${list.map(r2 => duelHtml(r2, ctx, api)).join('')}</div>` : `<div class="hw-wall-empty">${empty}</div>`);
    return intro + kings + send + sect('📬 Para ti', forMe, 'Nada à tua espera. Quando alguém te desafiar (ou registar um resultado para confirmares), aparece aqui.')
      + sect('✈️ Em curso', ongoing, 'Nenhum desafio em curso.')
      + (done.length ? sect('🗂 Histórico', done, '') : '');
  }

  // Quantas missões já estão cumpridas e à espera de serem reclamadas (para o selo do separador).
  function readyCount(ctx, api){
    return EventCore.expandMissions(mod, ctx.ev, { x1: api.x1On }, ctx)
      .filter(m => { const s = EventCore.evaluate(ctx, m); return s.done && !s.claimed && !m.locked; }).length;
  }

  // ---------- Separador 3: Quadro de postais ----------
  const hashCode = s => { let h = 0; for(const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  function weekOfMessage(ctx, m){
    const t = Date.parse(m.created_at);
    let best = 1;
    Object.keys(ctx.windows).forEach(w => { const win = ctx.windows[w]; if(t >= win.from && t < win.to) best = +w; });
    return Math.max(1, Math.min(best, mod.weeks.length));
  }
  const fmtDay = day => new Date(day + 'T00:00:00Z').toLocaleDateString('pt-PT', { day:'numeric', month:'short', timeZone:'UTC' });
  const stampDate = day => new Date(day + 'T00:00:00Z').toLocaleDateString('pt-PT', { day:'2-digit', month:'short', timeZone:'UTC' }).replace('.', '').toUpperCase();

  function postcardHtml(m, ctx, fresh){
    const mine = m.author_name === ctx.me;
    const h = hashCode(m.id);
    const rot = ((h % 45) / 10 - 2.2).toFixed(1);          // -2.2º .. +2.2º
    const tape = h % 2 ? 'a' : 'b';
    const wk = weekOfMessage(ctx, m);
    const emoji = REGION_EMOJI[mod.weeks[wk - 1].region];
    const counts = {}; (m.reactions || []).forEach(r => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; });
    const mineR = (m.reactions || []).find(r => r.reactor_name === ctx.me);
    const reacts = mod.board.emojis.map((e, i) =>
      `<button class="hw-react${mineR && mineR.emoji === e ? ' on' : ''}" ${mine ? 'disabled' : ''} onclick="doReact('${safeId(m.id)}', ${i})" title="${mine ? 'Não podes reagir ao teu recado' : 'Reagir'}">${e}${counts[e] ? `<b>${counts[e]}</b>` : ''}</button>`).join('');
    return `<article class="hw-postcard${mine ? ' mine' : ''}${fresh && fresh.has(m.id) ? ' hw-new' : ''}" data-region="${mod.weeks[wk - 1].region}" style="--rot:${rot}deg">
      <span class="hw-tape ${tape}"></span>
      <div class="hw-pc-stamp"><span class="hw-pc-emoji">${emoji}</span><span class="hw-pc-postmark">${stampDate(m.day)}</span></div>
      <p class="hw-pc-text">${escapeHtml(m.body)}</p>
      <div class="hw-pc-author">— ${escapeHtml(m.author_name)}${mine ? ' (tu)' : ''}</div>
      <div class="hw-pc-reacts">${reacts}</div>
    </article>`;
  }

  function renderBoard(ctx, api){
    if(!ctx.board.available){
      return `<div class="hw-board-off"><div class="hw-board-off-ico">📜</div><b>O mural de recados abre em breve.</b><br>Estamos a preparar o mural — volta daqui a pouco.</div>`;
    }
    const today = EventCore.utcDay();
    const days = EventCore.board.byDay(ctx);
    const todayMsgs = (days.find(d => d.day === today) || { messages: [] }).messages;
    const posted = EventCore.board.hasPostedToday(ctx);
    const eventDay = Math.max(1, Math.floor((Date.parse(today + 'T00:00:00Z') - Date.parse(String(ctx.ev.starts_at || ctx.ev.created_at).slice(0, 10) + 'T00:00:00Z')) / 86400000) + 1);
    const draft = api.ui.draft || '';
    const compose = posted
      ? `<div class="hw-compose done"><div class="hw-compose-card"><div class="hw-compose-ok">✔ Já deixaste o teu recado de hoje.<br><small>Volta amanhã (o dia muda à meia-noite UTC, como o bónus diário) e cumpre as missões do mural reagindo aos recados dos outros.</small></div></div></div>`
      : `<div class="hw-compose"><div class="hw-compose-card">
          <div class="hw-compose-head"><span>📜 Recado do dia ${eventDay}</span><span class="hw-compose-hint">1 por dia</span></div>
          <textarea id="evDraft" maxlength="${EventCore.board.MAX_LEN}" rows="3" placeholder="Escreve um recado para o mural do evento… (um cumprimento arrepiante, uma provocação amigável, uma dica!)" oninput="evDraftInput(this)">${escapeHtml(draft)}</textarea>
          <div class="hw-compose-foot"><span class="hw-count" id="evCount">${draft.length}/${EventCore.board.MAX_LEN}</span><button class="hw-send" onclick="doPostCard(this)">📜 Deixar recado</button></div>
        </div></div>`;
    const todayHtml = todayMsgs.length
      ? `<div class="hw-wall">${todayMsgs.map(m => postcardHtml(m, ctx, api.ui.fresh)).join('')}</div>`
      : '<div class="hw-wall-empty">Ainda ninguém escreveu hoje. Sê o primeiro a deixar um recado!</div>';
    const older = days.filter(d => d.day !== today).slice(0, 7);
    const olderHtml = older.length ? `<h3 class="hw-h3">🗂 Dias anteriores</h3>` + older.map(d => {
      const key = 'd' + d.day;
      return `<details class="hw-day" ${api.ui.open[key] ? 'open' : ''} ontoggle="evToggle('${key}', this.open)">
        <summary><b>${fmtDay(d.day)}</b><small>${d.messages.length} recado${d.messages.length === 1 ? '' : 's'}</small></summary>
        <div class="hw-wall">${d.messages.map(m => postcardHtml(m, ctx, api.ui.fresh)).join('')}</div>
      </details>`;
    }).join('') : '';
    return `<div class="hw-board-intro"><h3 class="hw-h3">📜 Mural de recados <span class="hw-live" title="O mural atualiza sozinho — os recados e reações dos outros aparecem em poucos segundos"><i></i>ao vivo</span></h3><p>Um recado por dia para todos os convidados da mansão. Reage aos dos outros — também conta para as missões!</p></div>
      ${compose}
      <h3 class="hw-h3">☀️ Hoje · ${fmtDay(today)}</h3>
      ${todayHtml}
      ${olderHtml}`;
  }

  // ---------- Separador: Loja de Doces (Doces -> recordações) ----------
  // O que se vende e o PREÇO vêm da base (ctx.shop.items, tabela event_shop_items); aqui só se desenha. A compra é a
  // função da base buy_event_item (EventCore.shop.buy, chamada por doShopBuy em eventos.html).
  const SHOP_GROUPS = [
    { cat:'badges',      label:'Emblemas',        icon:'🏷️' },
    { cat:'accents',     label:'Cor de destaque', icon:'✨' },
    { cat:'titles',      label:'Títulos',         icon:'✒️' },
    { cat:'nameEffects', label:'Efeitos de nome', icon:'🔤' },
    { cat:'backgrounds', label:'Cor da moldura',  icon:'🎨' },
    { cat:'frames',      label:'Molduras animadas', icon:'🖼️' }
  ];
  function shopItemHtml(it, c, state, balance){
    const sid = safeId(it.item_id), cur = mod.currency.emoji;
    let action;
    if(state === 'owned') action = '<div class="hw-shop-own">✔ Já tens</div>';
    else if(state === 'locked'){
      const wk = it.available_week, reg = wk >= 1 && wk <= WEEK_NAMES.length ? WEEK_NAMES[wk - 1] : '';
      action = `<div class="hw-shop-need">🔒 Abre na semana ${wk}${reg ? ' (' + reg + ')' : ''}</div>`;
    }
    else if(state === 'cant') action = `<div class="hw-shop-need">Faltam ${it.cost - balance} ${cur}</div>`;
    else action = `<button class="hw-shop-buy" onclick="doShopBuy('${sid}', this)">Comprar</button>`;
    return `<div class="hw-shop-item ${state}" data-item="${sid}">
      <div class="hw-shop-prev">${cosmeticPreview(it.item_id)}</div>
      <div class="hw-shop-name">${escapeHtml(c.name)}</div>
      <div class="hw-shop-cost">${cur} ${it.cost}</div>
      ${action}
    </div>`;
  }
  function renderShop(ctx, api){
    const t = EventCore.totals(ctx, ctx.me);
    const owned = new Set((typeof myProfile !== 'undefined' && myProfile && myProfile.ownedCosmetics) || []);
    ctx.shop.purchases.forEach(p => owned.add(p.item_id));
    const items = ctx.shop.items.filter(it => getCosmeticById(it.item_id));
    const missing = ctx.shop.items.length - items.length;
    const groups = SHOP_GROUPS.map(g => {
      const list = items.filter(it => findCosmeticCategory(it.item_id) === g.cat);
      if(!list.length) return '';
      return `<section class="hw-section"><h3 class="hw-h3">${g.icon} ${g.label}</h3><div class="hw-shop-grid">${
        list.map(it => shopItemHtml(it, getCosmeticById(it.item_id), owned.has(it.item_id) ? 'owned' : (it.available_week && it.available_week > ctx.ev.current_week ? 'locked' : (t.balance >= it.cost ? 'can' : 'cant')), t.balance)).join('')
      }</div></section>`;
    }).join('');
    return `<section class="hw-shop-head">
        <div class="txt">
          <h3 class="hw-h3">🛍️ Loja de Doces</h3>
          <p>Troca os teus ${mod.currency.name} por recordações exclusivas da noite. Só se compram aqui, ficam para sempre no teu perfil (equipa-as em <b>Perfil → Customizar</b>) e não se podem trocar nem pôr em leilão.</p>
        </div>
        <div class="hw-shop-bal"><span class="n">${mod.currency.emoji} ${t.balance}</span><span class="l">${mod.currency.name} para gastar</span></div>
      </section>
      ${groups}
      ${missing ? '<div class="hw-soon">Há recordações novas que só aparecem depois de atualizares a página (<b>Ctrl+F5</b>).</div>' : ''}
      <div class="hw-soon">Ganhaste ${t.miles} ${mod.currency.name}${t.spent ? ` e gastaste ${t.spent}` : ''}. Quando o evento terminar, as ${mod.currency.name} que sobrarem convertem-se em moedas (2 ${mod.currency.name} = 🪙1).</div>`;
  }

  // ---------- Celebração: confetti de ✈️ / ✨ à volta de um elemento ----------
  function celebrate(anchor, kind){
    if(prefersReducedMotion() || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const em = kind === 'level' ? ['🎃','👻','🦇','🍬','⭐'] : ['🍬','🕸️','🎃'];
    const n = kind === 'level' ? 26 : 12;
    for(let i = 0; i < n; i++){
      const s = document.createElement('span');
      s.className = 'hw-confetti';
      s.textContent = em[i % em.length];
      const ang = Math.random() * Math.PI * 2, dist = 60 + Math.random() * (kind === 'level' ? 200 : 90);
      s.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist - 40}px;--rot:${(Math.random() * 540 - 270) | 0}deg;animation-delay:${(Math.random() * 120) | 0}ms;`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1700);
    }
  }

  const mod = {
    slug: 'halloween',
    name: 'Halloween',
    currency: { name:'Doces', emoji:'🍬' },
    weeks: [ { region:'halloween' }, { region:'halloween' } ],
    levels: LEVELS,
    missions: MISSIONS,
    regionEmoji: REGION_EMOJI,
    board: { emojis: ['👻', '😂', '🎃', '🦇', '🔥'] },
    boardWord: 'recado', boardName: 'mural', boardIcon: '📜', itemWord: 'recordação',   // palavras usadas pelos avisos de eventos.html
    // Separadores desta página (cada evento define os seus).
    tabs: [
      { key:'passaporte', icon:'🏚️', label:'Mansão',     render: renderMansao },        // a chave 'passaporte' é interna (a casca usa-a como separador por defeito)
      { key:'missoes',    icon:'🎯', label:'Missões',    render: renderMissions, badge: readyCount },
      { key:'loja',       icon:'🛍️', label:'Loja',       render: renderShop, needs:'shop' },
      { key:'quadro',     icon:'📜', label:'Mural',      render: renderBoard },         // idem: 'quadro' é o separador que a casca atualiza ao vivo
      { key:'x1',         icon:'⚔️', label:'x1',         render: renderX1, needs:'x1', badge: ctx => EventCore.x1.waitingOnMe(ctx) }
    ],
    // Região da semana atual (a casca usa-a para colorir o céu da página).
    currentRegion(ctx){ const c = ctx.ev.current_week; return mod.weeks[Math.max(0, Math.min(c, mod.weeks.length) - 1)].region; },
    afterRender(tabKey, root, ctx, ui){
      if(tabKey === 'passaporte'){
        const sc = root.querySelector('.hw-log-scroll'), tag = root.querySelector('.hw-tag.next') || root.querySelector('.hw-tag.unlocked:last-of-type');
        if(sc && tag && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, tag.offsetLeft - sc.clientWidth / 2 + tag.offsetWidth / 2);
      }
    },
    cosmeticName, cosmeticPreview, celebrate
  };
  (window.EVENT_MODULES = window.EVENT_MODULES || {})[mod.slug] = mod;
})();
