// eventos/volta-ao-mundo.js — definição e visual do evento "Volta ao Mundo".
// Cada evento tem o seu par .js/.css (visual dedicado, não um template). O motor comum
// (missões, XP, claims, quadro) está em eventos-core.js; a casca da página em eventos.html.
// Identidade: AEROPORTO + PASSAPORTE + POSTAIS ao pôr do sol — capa em folha de ouro com a
// silhueta da região da semana, quadro de partidas, rota com o avião, etiquetas de bagagem,
// cartões de embarque para as missões e um mural de cartões-postais.
(function(){
  const REGION_EMOJI = { kanto:'🗼', johto:'🔔', hoenn:'🌋', sinnoh:'❄️' };

  // XP acumulado necessário para cada nível + cosmético exclusivo desbloqueado.
  // (Os cosméticos estão em COSMETIC_CATALOG, showdown-utils.js, com eventOnly:'volta-ao-mundo'.)
  const LEVELS = [
    { level:1, xp:100,  cosmeticId:'title_vm_mochileiro' },
    { level:2, xp:250,  cosmeticId:'badge_vm_kanto' },
    { level:3, xp:450,  cosmeticId:'bg_vm_ceu' },
    { level:4, xp:700,  cosmeticId:'badge_vm_johto' },
    { level:5, xp:1000, cosmeticId:'effect_vm_rasto' },
    { level:6, xp:1450, cosmeticId:'badge_vm_hoenn' },
    { level:7, xp:2000, cosmeticId:'badge_vm_sinnoh' },
    { level:8, xp:2600, cosmeticId:'frame_vm_rota' },
    // 9-12: prestígio de quem também compete (3200 XP > 2860, o máximo de quem nunca ganha nada)
    { level:9,  xp:3200, cosmeticId:'title_vm_piloto' },
    { level:10, xp:3900, cosmeticId:'effect_vm_aurora' },
    { level:11, xp:4600, cosmeticId:'bg_vm_porsol' },
    { level:12, xp:5400, cosmeticId:'frame_vm_esquadrilha' }
  ];

  // Grupos de missões = "portas de embarque".
  const GROUPS = {
    torneio:  { gate:'A', label:'Torneio',     icon:'🏟' },
    viajante: { gate:'B', label:'Viajante',    icon:'🌐' },
    quadro:   { gate:'C', label:'Quadro',      icon:'📮' },
    x1:       { gate:'D', label:'Desafios x1', icon:'⚔️' }
  };

  // Missões de CADA semana (id final = w<semana>_<key>) e do evento inteiro.
  // needs:'x1' | 'board' = só aparecem quando essa parte está ligada.
  // As de "viajante" e "quadro" não exigem ganhar partidas.
  const MISSIONS = {
    weekly: [
      { key:'play',     group:'torneio',  title:'Check-in',               desc:'Participa no torneio da semana.',                           check:{type:'participate'},               xp:60,  miles:10, coins:5 },
      { key:'win1',     group:'torneio',  title:'Primeira vitória',       desc:'Ganha 1 partida no torneio (desistências não contam).',     check:{type:'wins', target:1},           xp:80,  miles:15, coins:8 },
      { key:'win3',     group:'torneio',  title:'Em rota',                desc:'Ganha 3 partidas no torneio.',                              check:{type:'wins', target:3},           xp:120, miles:20, coins:12 },
      { key:'final',    group:'torneio',  title:'Chegada ao destino',     desc:'Chega à final do torneio.',                                 check:{type:'final'},                     xp:150, miles:25, coins:15 },
      { key:'champion', group:'torneio',  title:'Campeão da região',      desc:'Sê o campeão do torneio da semana — e ganha o título de Campeão dessa região.', check:{type:'champion'},        xp:250, miles:40, coins:30,
        grants:{ 1:'title_vm_campeao_kanto', 2:'title_vm_campeao_johto', 3:'title_vm_campeao_hoenn', 4:'title_vm_campeao_sinnoh' } },

      { key:'daily3',   group:'viajante', title:'Passageiro frequente',   desc:'Reclama o bónus diário 3 vezes esta semana.',               check:{type:'dailyW', target:3},          xp:40,  miles:8,  coins:5 },
      { key:'daily6',   group:'viajante', title:'Cliente VIP',            desc:'Reclama o bónus diário 6 vezes esta semana.',               check:{type:'dailyW', target:6},          xp:60,  miles:10, coins:8 },
      { key:'gift10',   group:'viajante', title:'Boa viagem!',            desc:'Doa 🪙10 (no total) a outros jogadores esta semana.',        check:{type:'giftSumW', target:10},       xp:40,  miles:8,  coins:0 },
      { key:'gift2',    group:'viajante', title:'Lembranças para todos',  desc:'Doa moedas a 2 jogadores diferentes esta semana.',          check:{type:'giftPeopleW', target:2},      xp:40,  miles:8,  coins:0 },
      { key:'bet1',     group:'viajante', title:'Aposta de viagem',       desc:'Faz 1 palpite numa partida esta semana (não precisas de acertar).', check:{type:'betsW', target:1},     xp:30,  miles:6,  coins:0 },
      { key:'roulette1',group:'viajante', title:'Escala no casino',       desc:'Joga uma vez na roleta esta semana.',                       check:{type:'rouletteW', target:1},       xp:25,  miles:5,  coins:0 },

      { key:'post1',    group:'quadro',   title:'Cartão-postal',          desc:'Deixa um postal no quadro do evento esta semana.',          check:{type:'postsW', target:1},          xp:30,  miles:6,  coins:3,  needs:'board' },
      { key:'post3',    group:'quadro',   title:'Correspondente',         desc:'Escreve no quadro em 3 dias diferentes esta semana.',       check:{type:'postDaysW', target:3},       xp:50,  miles:8,  coins:5,  needs:'board' },
      { key:'react3',   group:'quadro',   title:'Carteiro simpático',     desc:'Reage a 3 postais de outros jogadores esta semana.',        check:{type:'reactsW', target:3},         xp:30,  miles:6,  coins:3,  needs:'board' },

      { key:'x1send',   group:'x1',       title:'Convite de embarque',    desc:'Envia um desafio x1.',                                      check:{type:'x1sent'},   needs:'x1',        xp:40,  miles:8,  coins:0 },
      { key:'x1play',   group:'x1',       title:'Encontro de viajantes',  desc:'Joga um x1 confirmado.',                                    check:{type:'x1played'}, needs:'x1',        xp:70,  miles:12, coins:5 },
      { key:'x1win',    group:'x1',       title:'Duelo no aeroporto',     desc:'Ganha um x1.',                                              check:{type:'x1wins'},   needs:'x1',        xp:100, miles:15, coins:10 },
      { key:'x1win2',   group:'x1',       title:'Dupla vitória',          desc:'Ganha 2 x1 na mesma semana.',                               check:{type:'x1wins', target:2}, needs:'x1', xp:120, miles:20, coins:12 }
    ],
    event: [
      { id:'g_daily7',    title:'Viajante assíduo',        desc:'Reclama 7 bónus diários durante o evento.',                  check:{type:'dailyBonus', target:7},     xp:100, miles:15, coins:10 },
      { id:'g_pred',      title:'Vidente de viagem',       desc:'Acerta num palpite de uma partida de um torneio do evento.', check:{type:'prediction'},               xp:60,  miles:10, coins:5 },
      { id:'g_lottery',   title:'Bilhete da sorte',        desc:'Compra 1 bilhete da Loteria durante o evento.',              check:{type:'lottery'},                  xp:30,  miles:5,  coins:0 },
      { id:'g_nick',      title:'Guia turístico',          desc:'Vota no Apelido da Semana durante o evento.',                check:{type:'nickname'},                 xp:30,  miles:5,  coins:0 },
      { id:'g_generous',  title:'Mala cheia de presentes', desc:'Doa 🪙50 no total a outros jogadores durante o evento.',      check:{type:'giftSum', target:50},       xp:100, miles:15, coins:10 },
      { id:'g_postcards', title:'Álbum de viagem',         desc:'Deixa postais no quadro em 7 dias diferentes.',              check:{type:'postDays', target:7},       xp:100, miles:15, coins:10, needs:'board' },
      { id:'g_loved',     title:'Amigo de todos',          desc:'Recebe 5 reações nos teus postais.',                         check:{type:'reactionsReceived', target:5}, xp:80, miles:12, coins:8, needs:'board' },
      { id:'g_alltour',   title:'Volta ao mundo completa', desc:'Participa nos 4 torneios do evento.',                        check:{type:'weeksPlayed'},              xp:300, miles:60, coins:50 }
    ]
  };

  // ---------- Silhuetas (SVG inline, viewBox 600x120) por região ----------
  const SKYLINES = {
    kanto: `<rect x="0" y="92" width="34" height="28"/><rect x="40" y="78" width="26" height="42"/><rect x="72" y="96" width="40" height="24"/><rect x="118" y="70" width="30" height="50"/><rect x="154" y="88" width="36" height="32"/><rect x="196" y="82" width="28" height="38"/>
      <polygon points="300,8 305,34 311,34 318,120 282,120 289,34 295,34"/><rect x="288" y="32" width="24" height="5"/><rect x="291" y="66" width="18" height="4"/><rect x="299" y="2" width="2" height="12"/>
      <rect x="352" y="84" width="34" height="36"/><rect x="392" y="72" width="28" height="48"/><rect x="426" y="94" width="40" height="26"/><rect x="472" y="76" width="30" height="44"/><rect x="508" y="90" width="38" height="30"/><rect x="552" y="80" width="48" height="40"/>`,
    johto: `<path d="M0,120 Q60,84 140,100 T240,108 L240,120Z"/><path d="M360,120 Q430,80 500,98 T600,92 L600,120Z"/>
      <rect x="296" y="12" width="8" height="12"/><polygon points="300,2 303,12 297,12"/>
      <polygon points="272,36 328,36 340,46 260,46"/><rect x="280" y="46" width="40" height="12"/>
      <polygon points="266,64 334,64 348,74 252,74"/><rect x="274" y="74" width="52" height="12"/>
      <polygon points="258,90 342,90 358,100 242,100"/><rect x="266" y="100" width="68" height="20"/>
      <circle cx="150" cy="84" r="9"/><rect x="148" y="90" width="4" height="30"/>`,
    hoenn: `<polygon points="170,120 255,34 276,24 324,24 345,34 430,120"/><ellipse cx="300" cy="24" rx="26" ry="5"/>
      <circle cx="296" cy="12" r="9"/><circle cx="312" cy="4" r="7"/><circle cx="326" cy="-2" r="5"/>
      <path d="M0,104 Q25,94 50,104 T100,104 T150,104 L150,120 L0,120Z"/><path d="M430,104 Q455,94 480,104 T530,104 T580,104 L600,104 L600,120 L430,120Z"/>
      <rect x="62" y="70" width="4" height="36"/><path d="M64,70 Q48,60 38,66 M64,70 Q80,58 92,66 M64,70 Q60,54 66,48"/>
      <rect x="540" y="76" width="4" height="30"/><path d="M542,76 Q528,66 518,72 M542,76 Q556,64 568,72"/>`,
    sinnoh: `<polygon points="0,120 88,42 150,92 232,20 336,104 424,52 520,108 600,120"/>
      <polygon points="232,20 214,48 232,40 244,50" class="vm-snow"/><polygon points="88,42 74,62 88,56 100,64" class="vm-snow"/><polygon points="424,52 410,72 424,66 436,74" class="vm-snow"/>
      <polygon points="30,120 40,92 50,120"/><polygon points="52,120 64,86 76,120"/><polygon points="540,120 552,90 564,120"/><polygon points="566,120 578,84 590,120"/>`
  };

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
    if(cat === 'badges')      return `<span class="vm-prev-emoji">${c.emoji}</span>`;
    if(cat === 'titles')      return `<span class="vm-prev-text">${escapeHtml(c.text)}</span>`;
    if(cat === 'frames')      return frameEffectPreviewHtml(c.effect);
    if(cat === 'nameEffects') return `<span class="vm-prev-name ${nameFxClass(c)}">Abc</span>`;
    if(cat === 'backgrounds') return `<div class="shop-swatch" style="background:${c.css};"></div>`;
    return '';
  }

  const safeId = s => String(s).replace(/[^a-zA-Z0-9_-]/g, '');
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Estado de cada paragem/carimbo ----------
  // upcoming = semana ainda não abriu · current = semana a decorrer (ainda sem participação)
  // done = carimbado (participaste) · missed = a semana existe e não participaste
  function stampState(ctx, week){
    const cur = ctx.ev.current_week;
    if(week > cur) return 'upcoming';
    const ws = ctx.weekStats[week];
    if(ws && ws.participated) return 'done';
    if(week === cur && (!ws || ws.status !== 'concluido')) return 'current';
    return 'missed';
  }
  const STATE_LABEL = { upcoming:'Por vir', current:'Estás aqui!', done:'Carimbado ✓', missed:'Sem carimbo' };

  // ---------- Rota (SVG único): curva, 4 carimbos e o avião ----------
  const STOPS = [ {x:110,y:112}, {x:300,y:72}, {x:500,y:116}, {x:690,y:76} ];
  const ROUTE_D = 'M30,150 C70,150 80,112 110,112 C190,112 220,72 300,72 C380,72 420,116 500,116 C580,116 610,76 690,76 C735,76 765,58 785,34';

  function stampSvg(i, region, state){
    const r = EVENT_REGIONS[region], st = STOPS[i];
    return `<g class="vm-s ${state}" data-region="${region}" transform="translate(${st.x},${st.y})">
      <g class="vm-s-ink">
        <circle r="45" class="ring1"/><circle r="44" class="grain" fill="url(#vmGrain)"/><circle r="38" class="ring2"/>
        <text y="-3" text-anchor="middle" class="emoji">${REGION_EMOJI[region]}</text>
        <text y="15" text-anchor="middle" class="rname">${r.label.toUpperCase()}</text>
        <text y="27" text-anchor="middle" class="rweek">SEMANA ${i + 1}</text>
        ${state === 'missed' ? '<line x1="-30" y1="-30" x2="30" y2="30" class="strike"/>' : ''}
      </g>
      <text y="68" text-anchor="middle" class="cap">${r.label} <tspan class="dex">${r.dex}</tspan></text>
      <text y="84" text-anchor="middle" class="state">${STATE_LABEL[state]}</text>
    </g>`;
  }

  function routeHtml(ctx){
    const stamps = mod.weeks.map((w, i) => stampSvg(i, w.region, stampState(ctx, i + 1))).join('');
    return `<svg class="vm-route-svg" viewBox="0 0 800 215" role="img" aria-label="Rota do evento pelas quatro regiões">
      <defs>
        <pattern id="vmGrain" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.55"/><circle cx="3" cy="3" r="0.4"/></pattern>
      </defs>
      <path id="vmRoutePath" class="vm-route-base" d="${ROUTE_D}"/>
      <path id="vmRouteGlow" class="vm-route-glow" d="${ROUTE_D}"/>
      <path id="vmRouteProg" class="vm-route-prog" d="${ROUTE_D}"/>
      ${stamps}
      <g id="vmPlane" class="vm-plane-g">
        <path class="halo" d="M0,-13 L4,-4 L19,3 L19,7 L4,3 L3,11 L9,14 L9,16 L0,14 L-9,16 L-9,14 L-3,11 L-4,3 L-19,7 L-19,3 L-4,-4 Z" transform="scale(1.55)"/>
        <path class="body" d="M0,-13 L4,-4 L19,3 L19,7 L4,3 L3,11 L9,14 L9,16 L0,14 L-9,16 L-9,14 L-3,11 L-4,3 L-19,7 L-19,3 L-4,-4 Z"/>
      </g>
    </svg>`;
  }

  // Anima o avião do início até à paragem atual (só na 1.ª vez; depois salta para lá).
  function animateRoute(root, ctx, ui){
    const svg = root.querySelector('.vm-route-svg');
    if(!svg) return;
    const path = svg.querySelector('#vmRoutePath'), prog = svg.querySelector('#vmRouteProg'), glow = svg.querySelector('#vmRouteGlow'), plane = svg.querySelector('#vmPlane');
    if(!path.getTotalLength) return;
    const total = path.getTotalLength();
    const cur = ctx.ev.current_week;
    let target = 0;
    if(cur > 0){
      const st = STOPS[Math.min(cur, STOPS.length) - 1];
      let best = 1e9;
      for(let i = 0; i <= 400; i++){
        const L = (i / 400) * total, p = path.getPointAtLength(L);
        const d = Math.hypot(p.x - st.x, p.y - st.y);
        if(d < best){ best = d; target = L; }
      }
    }
    // O avião "estaciona" um pouco ANTES do carimbo da paragem atual (para não o tapar); o traço
    // dourado do caminho percorrido chega até ao centro do carimbo.
    const GAP = 58, stopL = target, planeL = target > GAP ? target - GAP : 0;
    target = planeL;
    const place = L => {
      const p = path.getPointAtLength(L), q = path.getPointAtLength(Math.min(total, L + 2));
      const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 90;
      plane.setAttribute('transform', `translate(${p.x},${p.y}) rotate(${ang})`);
      const reach = target > 0 ? L + (stopL - target) * (L / target) : L;
      prog.style.strokeDasharray = `${reach} ${total}`;
      glow.style.strokeDasharray = `${reach} ${total}`;
    };
    if(ui.routeAnimated || prefersReducedMotion() || target === 0){ place(target); plane.classList.add('landed'); ui.routeAnimated = true; return; }
    ui.routeAnimated = true;
    const t0 = performance.now(), dur = 2000;
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    let finished = false;
    const finish = () => { if(finished) return; finished = true; place(target); plane.classList.add('landed'); };
    const step = now => {
      if(finished) return;
      const t = Math.min(1, (now - t0) / dur);
      place(target * ease(t));
      if(t < 1) requestAnimationFrame(step); else finish();
    };
    place(0);
    requestAnimationFrame(step);
    setTimeout(finish, dur + 400); // rede de segurança: se o browser pausar as animações, o avião chega na mesma
  }

  // ---------- Quadro de partidas (células tipo split-flap) ----------
  function flapRow(label, text){
    const cells = [...String(text).toUpperCase()].map((ch, i) =>
      `<span class="vm-flap" style="--i:${i}">${ch === ' ' ? '&nbsp;' : escapeHtml(ch)}</span>`).join('');
    return `<div class="vm-flap-row"><span class="vm-flap-label">${label}</span><span class="vm-flap-cells">${cells}</span></div>`;
  }

  // ---------- Separador 1: Passaporte ----------
  function renderPassport(ctx, api){
    const ev = ctx.ev, cur = ev.current_week;
    const regionKey = cur > 0 ? mod.weeks[Math.min(cur, mod.weeks.length) - 1].region : mod.weeks[0].region;
    const r = EVENT_REGIONS[regionKey];
    const ended = ev.status !== 'active';
    const estado = cur === 0 ? 'ABRE EM BREVE' : (ended ? 'ENCERRADO' : 'A DECORRER');
    const destino = cur === 0 ? 'KANTO' : r.label;
    let rule;
    if(cur > 0){
      rule = `📜 <b>Semana ${cur} — ${r.label}:</b> só valem Pokémon de ${r.label} (${r.dex}), na forma original (sem formas regionais). Vale para o torneio e para os x1.`;
    } else {
      rule = '📜 O evento arranca com o torneio da Semana 1. Fica atento!';
    }
    return `
    <section class="vm-hero${api.ui.intro ? ' intro' : ''}" data-region="${regionKey}">
      <svg class="vm-skyline" viewBox="0 0 600 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${SKYLINES[regionKey]}</svg>
      <div class="vm-hero-inner">
        <div class="vm-cover-top">
          <span class="vm-globe" aria-hidden="true">🌍</span>
          <div>
            <div class="vm-kicker">Passaporte · Edição ${new Date(ev.starts_at || Date.now()).getUTCFullYear()}</div>
            <h2 class="vm-title">Volta ao Mundo</h2>
          </div>
        </div>
        <div class="vm-holder">Titular: <b>${escapeHtml(ctx.me)}</b></div>
        <div class="vm-departures" role="group" aria-label="Quadro de partidas">
          ${flapRow('DESTINO', destino)}
          ${flapRow('SEMANA', `${Math.max(cur, 0)} / ${ev.total_weeks}`)}
          ${flapRow('ESTADO', estado)}
        </div>
        <div class="vm-rule">${rule}</div>
      </div>
    </section>
    <section class="vm-route-card">${routeHtml(ctx)}</section>
    <section class="vm-section">${levelsHtml(ctx)}</section>
    <section class="vm-section vm-ranking"><h3 class="vm-h3">🏆 Ranking do evento</h3>${rankingHtml(ctx, api)}</section>
    ${api.x1On ? '' : `<div class="vm-soon">⚔️ Os desafios x1 (até ${EventCore.x1.MAX_PER_WEEK} por semana) chegam em breve — vão trazer mais missões.</div>`}`;
  }

  function rankingHtml(ctx){
    const rows = EventCore.ranking(ctx).slice(0, 10);
    if(!rows.length) return '<div class="empty-state">Ainda ninguém reclamou missões. Sê o primeiro!</div>';
    return rows.map((r, i) => {
      const lv = EventCore.levelFor(mod, r.xp).level;
      const medal = ['🥇','🥈','🥉'][i] || (i + 1);
      return `<div class="vm-rank-row${r.name === ctx.me ? ' me' : ''}">
        <span class="vm-rank-pos">${medal}</span>
        <span class="vm-rank-name">${escapeHtml(r.name)}</span>
        <span class="vm-rank-lvl">Nível ${lv}</span>
        <span class="vm-rank-xp">${r.xp} XP</span>
      </div>`;
    }).join('');
  }

  // ---------- Diário de voo: XP + etiquetas de bagagem ----------
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
      return `<div class="vm-tag ${state}" style="--d:${(i * 0.37).toFixed(2)}s">
        <span class="vm-tag-loop"></span>
        <div class="vm-tag-lvl">Nível ${l.level}</div>
        <div class="vm-tag-prev">${cosmeticPreview(l.cosmeticId)}</div>
        <div class="vm-tag-name">${escapeHtml(cosmeticName(l.cosmeticId))}</div>
        <div class="vm-tag-xp">${state === 'unlocked' ? '✔ desbloqueado' : l.xp + ' XP'}</div>
      </div>`;
    }).join('');
    return `<div class="vm-xp">
      <div class="vm-xp-top">
        <span class="vm-xp-level">Nível ${lv.level}</span>
        <span class="vm-xp-num">${t.xp} XP${lv.next ? ' / ' + lv.next.xp : ''}</span>
        <span class="vm-xp-miles">${mod.currency.emoji} ${t.miles} ${mod.currency.name}</span>
      </div>
      <div class="vm-bar"><div style="width:${lv.pct}%"></div></div>
      <div class="vm-xp-next">${nextTxt}</div>
    </div>
    <div class="vm-log" style="--frac:${frac};--n:${n};--minw:${n * 114}px">
      <div class="vm-log-scroll">
        <div class="vm-log-track"><i></i><span class="vm-log-plane">✈️</span></div>
        <div class="vm-tags">${tags}</div>
      </div>
    </div>`;
  }

  // ---------- Separador 2: Missões (cartões de embarque) ----------
  function passHtml(m, ctx, api, idx){
    const st = EventCore.evaluate(ctx, m);
    const pct = st.target ? Math.round((st.value / st.target) * 100) : 0;
    const g = GROUPS[m.group] || GROUPS.torneio;
    const sid = safeId(m.id);
    let action;
    if(m.locked) action = '<span class="vm-pass-lock">🔒 por abrir</span>';
    else if(st.claimed) action = `<span class="vm-claimed${api.ui.justClaimed === m.id ? ' slam' : ''}">Reclamada</span>`;
    else if(st.done) action = `<button class="vm-claim" onclick="doClaim('${sid}', this)">Reclamar</button>`;
    else action = `<span class="vm-pass-prog">${st.value}/${st.target}</span>`;
    const code = (m.scope === 'week' ? `W${m.week}` : 'EV') + '·' + String(idx).padStart(2, '0');
    return `<div class="vm-pass${st.claimed ? ' claimed' : ''}${st.done && !st.claimed && !m.locked ? ' ready' : ''}${m.locked ? ' locked' : ''}" data-grp="${m.group || 'torneio'}" data-mid="${sid}">
      <div class="vm-pass-main">
        <div class="vm-pass-top"><span class="vm-pass-code">${code}</span><span class="vm-pass-grp">${g.icon} ${g.label}</span></div>
        <div class="vm-pass-title">${escapeHtml(m.title)}</div>
        <div class="vm-pass-desc">${escapeHtml(m.desc)}</div>
        ${!st.claimed && !m.locked ? `<div class="vm-pass-bar"><i style="width:${pct}%"></i></div>` : ''}
      </div>
      <div class="vm-pass-stub">
        <div class="vm-pass-rewards">
          <span>+${m.xp} XP</span><span>${mod.currency.emoji} ${m.miles}</span>${m.coins ? `<span>🪙 ${m.coins}</span>` : ''}
        </div>
        <div class="vm-pass-action">${action}</div>
        <div class="vm-barcode" aria-hidden="true"></div>
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
      return `<div class="vm-gate"><div class="vm-gate-head"><span class="vm-gate-sign">${g.gate}</span><span class="vm-gate-name">${g.icon} ${g.label}</span></div>
        ${items.map((m, i) => passHtml(m, ctx, api, i + 1)).join('')}</div>`;
    }).join('');
    return `<details class="vm-week${locked ? ' locked' : ''}" data-region="${w.region}" ${isOpen ? 'open' : ''} ontoggle="evToggle('${key}', this.open)">
      <summary class="vm-week-head">
        <span class="vm-wh-emoji">${REGION_EMOJI[w.region]}</span>
        <span class="vm-wh-text"><b>Semana ${week} — ${r.label}</b><small>${r.dex}</small></span>
        ${ready ? `<span class="vm-wh-ready">${ready} por reclamar</span>` : ''}
        <span class="vm-wh-pill">${locked ? '🔒 abre com o torneio da semana' : (week === ctx.ev.current_week ? '✈️ semana atual' : 'encerrada')}</span>
        <span class="vm-wh-chev" aria-hidden="true">▾</span>
      </summary>
      <div class="vm-week-body">${locked ? '' : groups}${locked ? '<div class="vm-locked-note">As missões desta semana abrem quando o torneio da semana for criado.</div>' : ''}</div>
    </details>`;
  }

  function renderMissions(ctx, api){
    const all = EventCore.expandMissions(mod, ctx.ev, { x1: api.x1On }, ctx);
    let html = '';
    mod.weeks.forEach((w, i) => { html += weekMissionsHtml(ctx, api, all, i + 1); });
    const ev = all.filter(m => m.scope === 'event');
    const evReady = ev.filter(m => { const s = EventCore.evaluate(ctx, m); return s.done && !s.claimed && !m.locked; }).length;
    const isOpen = api.ui.open.ev !== undefined ? api.ui.open.ev : false;
    html += `<details class="vm-week vm-week-event" ${isOpen ? 'open' : ''} ontoggle="evToggle('ev', this.open)">
      <summary class="vm-week-head">
        <span class="vm-wh-emoji">🌍</span>
        <span class="vm-wh-text"><b>Missões do evento</b><small>valem durante todo o evento</small></span>
        ${evReady ? `<span class="vm-wh-ready">${evReady} por reclamar</span>` : ''}
        <span class="vm-wh-chev" aria-hidden="true">▾</span>
      </summary>
      <div class="vm-week-body"><div class="vm-gate">${ev.map((m, i) => passHtml(m, ctx, api, i + 1)).join('')}</div></div>
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
    win:     { cls:'go',   text:'🏆 Eu ganhei' }, lose:    { cls:'',     text:'Eu perdi' },
    confirm: { cls:'go',   text:'✔ Confirmar resultado' }, dispute: { cls:'no', text:'⚠ Contestar' }
  };

  function duelHtml(r, ctx){
    const st = X1_STATUS[r.status] || { label: r.status, step: 0 };
    const w = EventCore.x1.winnerOf(r);
    const acts = EventCore.x1.actionsFor(ctx, r);
    const region = r.week >= 1 && r.week <= mod.weeks.length ? EVENT_REGIONS[mod.weeks[r.week - 1].region].label : '';
    const side = name => `<div class="vm-duel-p${w === name && (r.status === 'confirmed' || r.status === 'resolved') ? ' win' : ''}${name === ctx.me ? ' me' : ''}"><b>${escapeHtml(name)}</b><small>${name === r.challenger_name ? 'desafiante' : 'adversário'}</small></div>`;
    const steps = STEPS.map((t, i) => `<li class="${st.step < 0 ? 'x' : (i <= st.step ? 'on' : '')}${i === st.step && st.step >= 0 ? ' cur' : ''}">${t}</li>`).join('');
    const sid = String(r.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const verdict = (r.status === 'confirmed' || r.status === 'resolved')
      ? (w ? `<div class="vm-duel-verdict">🏆 Vitória de <b>${escapeHtml(w)}</b></div>` : '<div class="vm-duel-verdict">Anulado pelo organizador</div>')
      : (r.status === 'reported' && w ? `<div class="vm-duel-verdict soft">${escapeHtml(r.reported_by)} registou: vitória de <b>${escapeHtml(w)}</b></div>` : '');
    const replay = r.replay_path && ['reported', 'confirmed', 'resolved'].includes(r.status)
      ? `<a class="vm-duel-replay" href="${encodeURI(r.replay_path).replace(/"/g, '%22')}" target="_blank" rel="noopener">▶ Ver replay</a>` : '';
    const isPlayer = r.challenger_name === ctx.me || r.opponent_name === ctx.me;
    // Antes de registar o resultado: campo opcional para colar o link do replay do Showdown.
    const replayField = acts.includes('win')
      ? `<input type="text" class="vm-x1replay" id="x1rp-${sid}" placeholder="Link do replay do Showdown (opcional) — replay.pokemonshowdown.com/…">` : '';
    // Depois: quem jogou ainda pode juntar o link se faltar.
    const replayAdd = isPlayer && !r.replay_path && ['reported', 'confirmed', 'resolved'].includes(r.status)
      ? `<div class="vm-x1replay-row"><input type="text" class="vm-x1replay" id="x1rp-${sid}" placeholder="Juntar o link do replay do Showdown"><button class="vm-x1btn" onclick="doX1Replay('${sid}',this)">Juntar replay</button></div>` : '';
    return `<div class="vm-duel s-${r.status}${acts.length ? ' mine' : ''}">
      <div class="vm-duel-top"><span>⚔️ Semana ${r.week}${region ? ' · ' + region : ''}</span><span class="vm-duel-status">${st.label}</span></div>
      <div class="vm-duel-vs">${side(r.challenger_name)}<span class="vm-duel-x">VS</span>${side(r.opponent_name)}</div>
      <ol class="vm-steps">${steps}</ol>
      ${verdict}${r.status === 'disputed' && r.note ? `<div class="vm-duel-note">“${escapeHtml(r.note)}”</div>` : ''}
      ${replayField}
      ${acts.length ? `<div class="vm-duel-actions">${acts.map(a => `<button class="vm-x1btn ${X1_BTN[a].cls}" onclick="doX1Act('${sid}','${a}',this)">${X1_BTN[a].text}</button>`).join('')}</div>` : ''}
      ${replay}${replayAdd}
    </div>`;
  }

  function renderX1(ctx, api){
    const cur = ctx.ev.current_week;
    const regionKey = mod.weeks[Math.max(0, Math.min(cur, mod.weeks.length) - 1)].region, r = EVENT_REGIONS[regionKey];
    const intro = `<div class="vm-board-intro"><h3 class="vm-h3">⚔️ Duelos no aeroporto</h3>
      <p>Desafia outro viajante para um x1 no Showdown. <b>Só valem Pokémon de ${r.label} (${r.dex}), na forma original.</b> Combinem o jogo, e depois <b>registem o resultado aqui</b> (quem jogou regista, o outro confirma). Ao registar, podes <b>colar o link do replay</b> do Showdown (<i>Upload and share replay</i>) — assim fica guardado e toda a gente o pode ver.</p></div>`;
    if(cur < 1) return intro + '<div class="vm-wall-empty">Os desafios abrem com o torneio da Semana 1.</div>';
    const q = EventCore.x1.quota(ctx);
    const names = (ctx.playerNames || []).filter(n => n !== ctx.me).sort((a, b) => a.localeCompare(b));
    const opts = '<option value="">— escolhe o adversário —</option>' + names.map(n =>
      `<option value="${escapeHtml(n).replace(/"/g, '&quot;')}"${q.opponents.has(n) ? ' disabled' : ''}>${escapeHtml(n)}${q.opponents.has(n) ? ' (já desafiado)' : ''}</option>`).join('');
    const send = `<div class="vm-x1send">
      <div class="vm-x1send-top"><b>Novo desafio</b><span class="vm-x1quota${q.left === 0 ? ' full' : ''}">${q.used}/${q.max} esta semana</span></div>
      <div class="vm-x1send-row"><select id="x1Opponent" ${q.left === 0 ? 'disabled' : ''}>${opts}</select>
        <button class="vm-send" onclick="doX1Send(this)" ${q.left === 0 ? 'disabled' : ''}>⚔️ Desafiar</button></div>
      ${q.left === 0 ? `<small>Já enviaste os ${q.max} desafios desta semana — voltas a poder na próxima.</small>` : `<small>Máximo ${q.max} desafios enviados por semana, a jogadores diferentes. Recusados e cancelados não contam.</small>`}
    </div>`;
    const rows = ctx.x1;
    const forMe = rows.filter(r2 => (r2.status === 'pending' && r2.opponent_name === ctx.me) || (r2.status === 'reported' && r2.reported_by !== ctx.me && (r2.challenger_name === ctx.me || r2.opponent_name === ctx.me)));
    const forMeIds = new Set(forMe.map(r2 => r2.id));
    const ongoing = rows.filter(r2 => !forMeIds.has(r2.id) && ['pending', 'accepted', 'reported', 'disputed'].includes(r2.status));
    const done = rows.filter(r2 => ['confirmed', 'resolved', 'declined', 'cancelled'].includes(r2.status));
    const sect = (title, list, empty) => `<h3 class="vm-h3">${title}</h3>` + (list.length ? `<div class="vm-duels">${list.map(r2 => duelHtml(r2, ctx)).join('')}</div>` : `<div class="vm-wall-empty">${empty}</div>`);
    return intro + send + sect('📬 Para ti', forMe, 'Nada à tua espera. Quando alguém te desafiar (ou registar um resultado para confirmares), aparece aqui.')
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
      `<button class="vm-react${mineR && mineR.emoji === e ? ' on' : ''}" ${mine ? 'disabled' : ''} onclick="doReact('${safeId(m.id)}', ${i})" title="${mine ? 'Não podes reagir ao teu postal' : 'Reagir'}">${e}${counts[e] ? `<b>${counts[e]}</b>` : ''}</button>`).join('');
    return `<article class="vm-postcard${mine ? ' mine' : ''}${fresh && fresh.has(m.id) ? ' vm-new' : ''}" data-region="${mod.weeks[wk - 1].region}" style="--rot:${rot}deg">
      <span class="vm-tape ${tape}"></span>
      <div class="vm-pc-stamp"><span class="vm-pc-emoji">${emoji}</span><span class="vm-pc-postmark">${stampDate(m.day)}</span></div>
      <p class="vm-pc-text">${escapeHtml(m.body)}</p>
      <div class="vm-pc-author">— ${escapeHtml(m.author_name)}${mine ? ' (tu)' : ''}</div>
      <div class="vm-pc-reacts">${reacts}</div>
    </article>`;
  }

  function renderBoard(ctx, api){
    if(!ctx.board.available){
      return `<div class="vm-board-off"><div class="vm-board-off-ico">📮</div><b>O quadro de postais abre em breve.</b><br>Estamos a preparar o mural — volta daqui a pouco.</div>`;
    }
    const today = EventCore.utcDay();
    const days = EventCore.board.byDay(ctx);
    const todayMsgs = (days.find(d => d.day === today) || { messages: [] }).messages;
    const posted = EventCore.board.hasPostedToday(ctx);
    const eventDay = Math.max(1, Math.floor((Date.parse(today + 'T00:00:00Z') - Date.parse(String(ctx.ev.starts_at || ctx.ev.created_at).slice(0, 10) + 'T00:00:00Z')) / 86400000) + 1);
    const draft = api.ui.draft || '';
    const compose = posted
      ? `<div class="vm-compose done"><div class="vm-compose-card"><div class="vm-compose-ok">✔ Já deixaste o teu postal de hoje.<br><small>Volta amanhã (o dia muda à meia-noite UTC, como o bónus diário) e cumpre as missões do quadro reagindo aos postais dos outros.</small></div></div></div>`
      : `<div class="vm-compose"><div class="vm-compose-card">
          <div class="vm-compose-head"><span>📮 Postal do dia ${eventDay}</span><span class="vm-compose-hint">1 por dia</span></div>
          <textarea id="evDraft" maxlength="${EventCore.board.MAX_LEN}" rows="3" placeholder="Escreve uma mensagem para o quadro do evento… (um cumprimento, uma provocação amigável, uma dica!)" oninput="evDraftInput(this)">${escapeHtml(draft)}</textarea>
          <div class="vm-compose-foot"><span class="vm-count" id="evCount">${draft.length}/${EventCore.board.MAX_LEN}</span><button class="vm-send" onclick="doPostCard(this)">📮 Enviar postal</button></div>
        </div></div>`;
    const todayHtml = todayMsgs.length
      ? `<div class="vm-wall">${todayMsgs.map(m => postcardHtml(m, ctx, api.ui.fresh)).join('')}</div>`
      : '<div class="vm-wall-empty">Ainda ninguém escreveu hoje. Sê o primeiro a deixar um postal!</div>';
    const older = days.filter(d => d.day !== today).slice(0, 7);
    const olderHtml = older.length ? `<h3 class="vm-h3">🗂 Dias anteriores</h3>` + older.map(d => {
      const key = 'd' + d.day;
      return `<details class="vm-day" ${api.ui.open[key] ? 'open' : ''} ontoggle="evToggle('${key}', this.open)">
        <summary><b>${fmtDay(d.day)}</b><small>${d.messages.length} postal${d.messages.length === 1 ? '' : 'is'}</small></summary>
        <div class="vm-wall">${d.messages.map(m => postcardHtml(m, ctx, api.ui.fresh)).join('')}</div>
      </details>`;
    }).join('') : '';
    return `<div class="vm-board-intro"><h3 class="vm-h3">📮 Quadro de postais <span class="vm-live" title="O quadro atualiza sozinho — os postais e reações dos outros aparecem em poucos segundos"><i></i>ao vivo</span></h3><p>Um postal por dia para todos os viajantes. Reage aos dos outros — também conta para as missões!</p></div>
      ${compose}
      <h3 class="vm-h3">☀️ Hoje · ${fmtDay(today)}</h3>
      ${todayHtml}
      ${olderHtml}`;
  }

  // ---------- Celebração: confetti de ✈️ / ✨ à volta de um elemento ----------
  function celebrate(anchor, kind){
    if(prefersReducedMotion() || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const em = kind === 'level' ? ['✈️','✨','🌍','🎉','⭐'] : ['✨','🎫','✈️'];
    const n = kind === 'level' ? 26 : 12;
    for(let i = 0; i < n; i++){
      const s = document.createElement('span');
      s.className = 'vm-confetti';
      s.textContent = em[i % em.length];
      const ang = Math.random() * Math.PI * 2, dist = 60 + Math.random() * (kind === 'level' ? 200 : 90);
      s.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist - 40}px;--rot:${(Math.random() * 540 - 270) | 0}deg;animation-delay:${(Math.random() * 120) | 0}ms;`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1700);
    }
  }

  const mod = {
    slug: 'volta-ao-mundo',
    name: 'Volta ao Mundo',
    currency: { name:'Milhas', emoji:'✈️' },
    weeks: [ { region:'kanto' }, { region:'johto' }, { region:'hoenn' }, { region:'sinnoh' } ],
    levels: LEVELS,
    missions: MISSIONS,
    regionEmoji: REGION_EMOJI,
    board: { emojis: ['❤️', '😂', '👏', '✈️', '🔥'] },
    // Separadores desta página (cada evento define os seus).
    tabs: [
      { key:'passaporte', icon:'🧭', label:'Passaporte', render: renderPassport },
      { key:'missoes',    icon:'🎯', label:'Missões',    render: renderMissions, badge: readyCount },
      { key:'quadro',     icon:'📮', label:'Quadro',     render: renderBoard },
      { key:'x1',         icon:'⚔️', label:'x1',         render: renderX1, needs:'x1', badge: ctx => EventCore.x1.waitingOnMe(ctx) }
    ],
    // Região da semana atual (a casca usa-a para colorir o céu da página).
    currentRegion(ctx){ const c = ctx.ev.current_week; return mod.weeks[Math.max(0, Math.min(c, mod.weeks.length) - 1)].region; },
    afterRender(tabKey, root, ctx, ui){
      if(tabKey === 'passaporte'){
        animateRoute(root, ctx, ui);
        const sc = root.querySelector('.vm-log-scroll'), tag = root.querySelector('.vm-tag.next') || root.querySelector('.vm-tag.unlocked:last-of-type');
        if(sc && tag && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, tag.offsetLeft - sc.clientWidth / 2 + tag.offsetWidth / 2);
      }
    },
    cosmeticName, cosmeticPreview, celebrate
  };
  (window.EVENT_MODULES = window.EVENT_MODULES || {})[mod.slug] = mod;
})();
