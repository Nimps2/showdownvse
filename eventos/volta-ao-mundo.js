// eventos/volta-ao-mundo.js — definição e visual do evento "Volta ao Mundo".
// Cada evento tem o seu par .js/.css (visual dedicado, não um template). O motor comum
// (missões, XP, claims) está em eventos-core.js; a casca da página em eventos.html.
// Tema: PASSAPORTE de viagem — capa, 4 carimbos (um por região), rota com o avião, etiquetas
// de bagagem com os prémios de cada nível.
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
    { level:6, xp:1350, cosmeticId:'badge_vm_hoenn' },
    { level:7, xp:1750, cosmeticId:'badge_vm_sinnoh' },
    { level:8, xp:2200, cosmeticId:'frame_vm_rota' }
  ];

  // Missões de CADA semana (id final = w<semana>_<key>) e missões do evento inteiro.
  // needs:'x1' = só aparecem quando os desafios x1 estão ligados.
  const MISSIONS = {
    weekly: [
      { key:'play',     title:'Check-in',               desc:'Participa no torneio da semana.',                        check:{type:'participate'},          xp:60,  miles:10, coins:5 },
      { key:'win1',     title:'Primeira vitória',       desc:'Ganha 1 partida no torneio (desistências não contam).',  check:{type:'wins', target:1},      xp:80,  miles:15, coins:8 },
      { key:'win3',     title:'Em rota',                desc:'Ganha 3 partidas no torneio.',                           check:{type:'wins', target:3},      xp:120, miles:20, coins:12 },
      { key:'final',    title:'Chegada ao destino',     desc:'Chega à final do torneio.',                              check:{type:'final'},                xp:150, miles:25, coins:15 },
      { key:'champion', title:'Campeão da região',      desc:'Sê o campeão do torneio da semana.',                     check:{type:'champion'},             xp:250, miles:40, coins:30 },
      { key:'x1send',   title:'Cartão-postal',          desc:'Envia um desafio x1.',                                   check:{type:'x1sent'},   needs:'x1', xp:40,  miles:8,  coins:0 },
      { key:'x1play',   title:'Encontro de viajantes',  desc:'Joga um x1 confirmado.',                                 check:{type:'x1played'}, needs:'x1', xp:70,  miles:12, coins:5 },
      { key:'x1win',    title:'Duelo no aeroporto',     desc:'Ganha um x1.',                                           check:{type:'x1wins'},   needs:'x1', xp:100, miles:15, coins:10 },
      { key:'x1win2',   title:'Dupla vitória',          desc:'Ganha 2 x1 na mesma semana.',                            check:{type:'x1wins', target:2}, needs:'x1', xp:120, miles:20, coins:12 }
    ],
    event: [
      { id:'g_daily7',  title:'Viajante assíduo',        desc:'Reclama 7 bónus diários durante o evento.',            check:{type:'dailyBonus', target:7}, xp:100, miles:15, coins:10 },
      { id:'g_pred',    title:'Vidente de viagem',       desc:'Acerta num palpite de uma partida de um torneio do evento.', check:{type:'prediction'},      xp:60,  miles:10, coins:5 },
      { id:'g_lottery', title:'Bilhete da sorte',        desc:'Compra 1 bilhete da Loteria durante o evento.',        check:{type:'lottery'},              xp:30,  miles:5,  coins:0 },
      { id:'g_nick',    title:'Guia turístico',          desc:'Vota no Apelido da Semana durante o evento.',          check:{type:'nickname'},             xp:30,  miles:5,  coins:0 },
      { id:'g_alltour', title:'Volta ao mundo completa', desc:'Participa nos 4 torneios do evento.',                  check:{type:'weeksPlayed'},          xp:300, miles:60, coins:50 }
    ]
  };

  // ---------- Pré-visualização de um cosmético (para as etiquetas de nível) ----------
  function cosmeticName(id){ const c = getCosmeticById(id); return c ? c.name : id; }
  function cosmeticPreview(id){
    const c = getCosmeticById(id);
    if(!c) return '';
    const cat = findCosmeticCategory(id);
    if(cat === 'badges')      return `<span class="vm-prev-emoji">${c.emoji}</span>`;
    if(cat === 'titles')      return `<span class="vm-prev-text">${escapeHtml(c.text)}</span>`;
    if(cat === 'frames')      return frameEffectPreviewHtml(c.effect);
    if(cat === 'nameEffects') return `<span class="vm-prev-name" style="${c.css}">Abc</span>`;
    if(cat === 'backgrounds') return `<div class="shop-swatch" style="background:${c.css};"></div>`;
    return '';
  }

  // ---------- Carimbos ----------
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

  function stampHtml(week, region, state){
    const r = EVENT_REGIONS[region];
    return `<div class="vm-stamp ${state}" data-region="${region}">
      ${state === 'current' ? '<span class="vm-plane" title="Semana a decorrer">✈️</span>' : ''}
      <svg viewBox="0 0 120 120" class="vm-stamp-svg" aria-hidden="true">
        <g transform="rotate(-9 60 60)">
          <circle cx="60" cy="60" r="54" class="ring1"/>
          <circle cx="60" cy="60" r="47" class="ring2"/>
          <text x="60" y="56" text-anchor="middle" class="emoji">${REGION_EMOJI[region]}</text>
          <text x="60" y="80" text-anchor="middle" class="rname">${r.label.toUpperCase()}</text>
          <text x="60" y="96" text-anchor="middle" class="rweek">SEMANA ${week}</text>
          ${state === 'missed' ? '<line x1="22" y1="22" x2="98" y2="98" class="strike"/>' : ''}
        </g>
      </svg>
      <div class="vm-stamp-cap"><b>${r.label}</b> <small>${r.dex}</small></div>
      <div class="vm-stamp-state">${STATE_LABEL[state]}</div>
    </div>`;
  }

  // ---------- Passaporte (capa + carimbos + regra) ----------
  function renderHero(ctx){
    const ev = ctx.ev, cur = ev.current_week;
    const stamps = mod.weeks.map((w, i) => stampHtml(i + 1, w.region, stampState(ctx, i + 1))).join('');
    let rule;
    if(cur > 0){
      const r = EVENT_REGIONS[mod.weeks[cur - 1].region];
      rule = `📜 <b>Semana ${cur} — ${r.label}:</b> só valem Pokémon de ${r.label} (${r.dex}), na forma original (sem formas regionais). Vale para o torneio e para os x1.`;
    } else {
      rule = '📜 O evento arranca com o torneio da Semana 1. Fica atento!';
    }
    return `<div class="vm-cover">
      <div class="vm-cover-top">
        <span class="vm-globe">🌍</span>
        <div>
          <div class="vm-kicker">Passaporte</div>
          <h2 class="vm-title">Volta ao Mundo</h2>
        </div>
      </div>
      <div class="vm-holder">Titular: <b>${escapeHtml(ctx.me)}</b> · Semana ${Math.max(cur, 0)} de ${ev.total_weeks}</div>
      <div class="vm-route">${stamps}</div>
      <div class="vm-rule">${rule}</div>
    </div>`;
  }

  // ---------- Barra de XP + etiquetas de bagagem com os prémios ----------
  function renderLevels(ctx){
    const t = EventCore.totals(ctx, ctx.me);
    const lv = EventCore.levelFor(mod, t.xp);
    const nextTxt = lv.next
      ? `Próximo prémio: <b>${escapeHtml(cosmeticName(lv.next.cosmeticId))}</b> — faltam ${lv.next.xp - t.xp} XP`
      : 'Chegaste ao nível máximo! 🎉';
    const tags = mod.levels.map(l => {
      const state = l.level <= lv.level ? 'unlocked' : (l.level === lv.level + 1 ? 'next' : 'locked');
      return `<div class="vm-tag ${state}">
        <span class="vm-tag-hole"></span>
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
    <div class="vm-tags">${tags}</div>`;
  }

  const mod = {
    slug: 'volta-ao-mundo',
    name: 'Volta ao Mundo',
    currency: { name:'Milhas', emoji:'✈️' },
    weeks: [ { region:'kanto' }, { region:'johto' }, { region:'hoenn' }, { region:'sinnoh' } ],
    levels: LEVELS,
    missions: MISSIONS,
    regionEmoji: REGION_EMOJI,
    cosmeticName, cosmeticPreview, renderHero, renderLevels
  };
  (window.EVENT_MODULES = window.EVENT_MODULES || {})[mod.slug] = mod;
})();
