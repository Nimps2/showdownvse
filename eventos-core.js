// eventos-core.js — motor comum dos EVENTOS (missões, XP, níveis, ranking, quadro de mensagens).
// Só é carregado por eventos.html (depois de showdown-utils.js). A definição de cada evento
// — semanas, missões, níveis, cosméticos e o VISUAL — vive em eventos/<slug>.js (+ .css);
// ver eventos/volta-ao-mundo.js. Aqui está só o que é igual para qualquer evento.
//
// Princípios:
//  - O progresso das missões é CALCULADO no browser a partir de dados que já existem
//    (torneios do evento, palpites, loteria, bónus diário, doações, quadro...); nada de contadores.
//  - XP e moeda do evento NÃO são guardados como saldo: o total de um jogador é a SOMA das suas
//    linhas em `event_claims` (a constraint unique(event_id, player_name, mission_id) impede
//    reclamar duas vezes a mesma missão).
//  - Reclamar = inserir a linha ANTES de pagar as moedas; se o pagamento falhar, apaga-se a linha.
//  - Vitórias por desistência (`wo:true`) NÃO contam em nenhuma missão.
//  - "Esta semana" = a janela entre a criação do torneio da semana W e a do torneio W+1 (ou agora).

const EventCore = (function(){
  const enc = encodeURIComponent;
  let URL_ = '', KEY_ = '';

  function init(url, key){ URL_ = url; KEY_ = key; }

  async function getJson(path, fallback){
    try{
      const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: sbAuthHeaders(KEY_) });
      if(!res.ok) return fallback;
      return await res.json();
    } catch(e){ return fallback; }
  }
  // Igual, mas diz se a tabela existe (404 = ainda não correram o SQL).
  async function getJsonStatus(path){
    try{
      const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: sbAuthHeaders(KEY_) });
      if(!res.ok) return { ok:false, status: res.status, data: [] };
      return { ok:true, status: res.status, data: await res.json() };
    } catch(e){ return { ok:false, status:0, data: [] }; }
  }
  const utcDay = () => new Date().toISOString().slice(0, 10);

  // ---------- Dados ----------
  // Devolve o "contexto" com tudo o que as missões precisam para UM jogador.
  async function load(ev, me){
    const tournaments = await fetchEventTournaments(URL_, KEY_, ev.id);
    const since = enc(ev.starts_at || ev.created_at);
    const [claims, tx, gifts, lottery, nick, preds, board] = await Promise.all([
      getJson(`event_claims?event_id=eq.${enc(ev.id)}&select=id,player_name,mission_id,xp,currency,coins`, []),
      getJson(`coin_transactions?player_name=eq.${enc(me)}&created_at=gte.${since}&select=reason,amount,created_at`, []),
      getJson(`gifts?from_name=eq.${enc(me)}&created_at=gte.${since}&select=to_name,amount,created_at`, []),
      getJson(`lottery_tickets?buyer_name=eq.${enc(me)}&created_at=gte.${since}&select=ticket_count,created_at`, []),
      getJson(`activity_log?actor_name=eq.${enc(me)}&actor_type=eq.jogador&category=eq.palpite&action=like.${enc('Votou*Apelido da Semana')}&created_at=gte.${since}&select=created_at`, []),
      getJson(`predictions?predictor_name=eq.${enc(me)}&created_at=gte.${since}&select=tournament_id,match_id,predicted_winner,created_at`, []),
      loadBoard(ev)
    ]);
    const ctx = { ev, me, tournaments, claims, tx, gifts, lottery, nick, preds, board, x1: [] };
    ctx.weekStats = computeWeekStats(ctx);
    ctx.windows = computeWindows(ctx);
    ctx.claimedIds = new Set(claims.filter(c => c.player_name === me).map(c => c.mission_id));
    return ctx;
  }

  async function loadBoard(ev){
    const m = await getJsonStatus(`event_messages?event_id=eq.${enc(ev.id)}&select=id,created_at,author_name,body,day&order=created_at.desc&limit=400`);
    if(!m.ok) return { available:false, messages:[], reactions:[] };
    const r = await getJson(`event_message_reactions?event_id=eq.${enc(ev.id)}&select=id,message_id,reactor_name,emoji,created_at&limit=3000`, []);
    return { available:true, messages: m.data, reactions: r };
  }

  // ---------- Janelas de semana ----------
  function computeWindows(ctx){
    const ts = ctx.tournaments.filter(t => t.data && t.data.event)
      .map(t => ({ week: t.data.event.week, at: Date.parse(t.created_at) })).sort((a, b) => a.week - b.week);
    const out = {};
    ts.forEach((t, i) => { out[t.week] = { from: t.at, to: ts[i + 1] ? ts[i + 1].at : Infinity }; });
    return out;
  }
  const inWin = (win, iso) => { if(!win) return false; const t = Date.parse(iso); return t >= win.from && t < win.to; };

  // ---------- Estatísticas por semana (um torneio de evento por semana) ----------
  function computeWeekStats(ctx){
    const out = {};
    ctx.tournaments.forEach(t => {
      const d = t.data || {};
      const week = d.event && d.event.week;
      if(!week) return;
      const matches = d.matches || [];
      const players = (d.players || []).filter(Boolean);
      const me = ctx.me;
      const st = { week, tournamentId: t.id, status: t.status, name: d.name || '', region: d.event.region,
        participated: players.includes(me), played: 0, wins: 0, losses: 0, sweeps: 0,
        reachedFinal: false, champion: d.champion === me };
      matches.forEach(m => {
        if(!m.p1 || !m.p2 || !m.winner) return;
        if(m.wo === true) return; // desistência: não conta
        if(m.p1 !== me && m.p2 !== me) return;
        st.played++;
        if(m.winner === me){
          st.wins++;
          if(m.bo === 3 && Array.isArray(m.games) && m.games.filter(g => g && g !== me).length === 0) st.sweeps++;
        } else st.losses++;
      });
      const fin = matches.find(m => m.next === null);
      if(fin && fin.p1 && fin.p2 && (fin.p1 === me || fin.p2 === me)) st.reachedFinal = true;
      out[week] = st;
    });
    return out;
  }

  function correctPredictions(ctx){
    let n = 0;
    ctx.preds.forEach(p => {
      const t = ctx.tournaments.find(x => x.id === p.tournament_id);
      const m = t && (t.data.matches || []).find(x => x.id === p.match_id);
      if(m && m.winner && m.winner === p.predicted_winner) n++;
    });
    return n;
  }

  // ---------- Quadro: contagens ----------
  const startsWith = (s, p) => typeof s === 'string' && s.indexOf(p) === 0;
  const myPosts = ctx => ctx.board.messages.filter(m => m.author_name === ctx.me);
  const msgAuthor = (ctx, id) => { const m = ctx.board.messages.find(x => x.id === id); return m ? m.author_name : null; };
  const myReactionsToOthers = ctx => ctx.board.reactions.filter(r => r.reactor_name === ctx.me && msgAuthor(ctx, r.message_id) && msgAuthor(ctx, r.message_id) !== ctx.me);
  const reactionsReceived = ctx => {
    const mine = new Set(myPosts(ctx).map(m => m.id));
    return ctx.board.reactions.filter(r => mine.has(r.message_id) && r.reactor_name !== ctx.me).length;
  };

  // ---------- Missões ----------
  // Valor atual vs alvo de uma missão (check = {type, target?}); week só para missões de semana.
  function measure(ctx, check, week){
    const ws = ctx.weekStats[week] || null;
    const win = ctx.windows[week] || null;
    const target = check.target || 1;
    const inW = arr => arr.filter(x => inWin(win, x.created_at));
    switch(check.type){
      // --- torneio ---
      case 'participate': return { value: ws && ws.participated ? 1 : 0, target: 1 };
      case 'wins':        return { value: ws ? ws.wins : 0, target };
      case 'final':       return { value: ws && ws.reachedFinal ? 1 : 0, target: 1 };
      case 'champion':    return { value: ws && ws.champion ? 1 : 0, target: 1 };
      case 'weeksPlayed': return { value: Object.values(ctx.weekStats).filter(w => w.participated).length, target: ctx.ev.total_weeks };
      // --- viajante (esta semana) ---
      case 'dailyW':      return { value: inW(ctx.tx.filter(t => startsWith(t.reason, 'Bônus diário'))).length, target };
      case 'giftSumW':    return { value: inW(ctx.gifts).reduce((s, g) => s + (g.amount || 0), 0), target };
      case 'giftPeopleW':return { value: new Set(inW(ctx.gifts).map(g => g.to_name)).size, target };
      case 'betsW':       return { value: inW(ctx.preds).length, target };
      case 'rouletteW':   return { value: inW(ctx.tx.filter(t => startsWith(t.reason, 'Roleta:'))).length, target };
      // --- quadro (esta semana) ---
      case 'postsW':      return { value: inW(myPosts(ctx)).length, target };
      case 'postDaysW':   return { value: new Set(inW(myPosts(ctx)).map(m => m.day)).size, target };
      case 'reactsW':     return { value: inW(myReactionsToOthers(ctx)).length, target };
      // --- evento inteiro ---
      case 'dailyBonus':  return { value: ctx.tx.filter(t => startsWith(t.reason, 'Bônus diário')).length, target };
      case 'prediction':  return { value: correctPredictions(ctx), target };
      case 'lottery':     return { value: ctx.lottery.reduce((s, r) => s + (r.ticket_count || 0), 0), target };
      case 'nickname':    return { value: ctx.nick.length, target };
      case 'giftSum':     return { value: ctx.gifts.reduce((s, g) => s + (g.amount || 0), 0), target };
      case 'postDays':    return { value: new Set(myPosts(ctx).map(m => m.day)).size, target };
      case 'reactionsReceived': return { value: reactionsReceived(ctx), target };
      // --- x1 (fase seguinte) ---
      case 'x1sent':      return { value: x1Count(ctx, week, x => x.challenger_name === ctx.me && !['declined','cancelled'].includes(x.status)), target };
      case 'x1played':    return { value: x1Count(ctx, week, x => isConfirmed(x)), target };
      case 'x1wins':      return { value: x1Count(ctx, week, x => isConfirmed(x) && winnerOf(x) === ctx.me), target };
      default:            return { value: 0, target };
    }
  }
  function isConfirmed(x){ return (x.status === 'confirmed' || x.status === 'resolved') && !!winnerOf(x); }
  function winnerOf(x){ return x.reported_winner || null; }
  function x1Count(ctx, week, pred){
    return (ctx.x1 || []).filter(x => x.week === week && (x.challenger_name === ctx.me || x.opponent_name === ctx.me) && pred(x)).length;
  }

  // Expande a definição do módulo numa lista plana de missões concretas.
  // Semanas que ainda não abriram (week > current_week) saem marcadas como `locked`.
  // Missões do quadro só aparecem se as tabelas do quadro existirem.
  function expandMissions(mod, ev, opts, ctx){
    const x1On = !!(opts && opts.x1);
    const boardOn = !ctx || ctx.board.available;
    const list = [];
    mod.weeks.forEach((w, i) => {
      const week = i + 1;
      mod.missions.weekly.forEach(def => {
        if(def.needs === 'x1' && !x1On) return;
        if(def.needs === 'board' && !boardOn) return;
        list.push(Object.assign({}, def, { id: `w${week}_${def.key}`, scope: 'week', week, locked: week > ev.current_week }));
      });
    });
    mod.missions.event.forEach(def => {
      if(def.needs === 'board' && !boardOn) return;
      list.push(Object.assign({}, def, { scope: 'event', week: null, locked: ev.current_week < 1 }));
    });
    return list;
  }

  function evaluate(ctx, mission){
    const m = measure(ctx, mission.check, mission.week);
    return { value: Math.min(m.value, m.target), target: m.target, done: m.value >= m.target,
             claimed: ctx.claimedIds.has(mission.id), locked: !!mission.locked };
  }

  // ---------- XP, níveis, ranking ----------
  function totals(ctx, name){
    let xp = 0, miles = 0, coins = 0;
    ctx.claims.forEach(c => { if(c.player_name === name){ xp += c.xp || 0; miles += c.currency || 0; coins += c.coins || 0; } });
    return { xp, miles, coins };
  }

  // levels = [{level, xp (acumulado), cosmeticId}] por ordem crescente.
  function levelFor(mod, xp){
    let level = 0;
    mod.levels.forEach(l => { if(xp >= l.xp) level = l.level; });
    const next = mod.levels.find(l => l.level === level + 1) || null;
    const prevXp = level > 0 ? mod.levels.find(l => l.level === level).xp : 0;
    const pct = next ? Math.max(0, Math.min(100, Math.round(((xp - prevXp) / (next.xp - prevXp)) * 100))) : 100;
    return { level, next, prevXp, pct, max: !next };
  }

  function ranking(ctx){
    const map = {};
    ctx.claims.forEach(c => {
      const r = map[c.player_name] || (map[c.player_name] = { name: c.player_name, xp: 0, miles: 0 });
      r.xp += c.xp || 0; r.miles += c.currency || 0;
    });
    return Object.values(map).sort((a, b) => b.xp - a.xp || b.miles - a.miles || a.name.localeCompare(b.name));
  }

  // ---------- Reclamar uma missão ----------
  const claimsInFlight = new Set();
  // Devolve {ok, reason, rewards}. reason: 'notdone' | 'already' | 'locked' | 'payment' | 'error' | 'busy'
  async function claimMission(ctx, mission){
    if(claimsInFlight.has(mission.id)) return { ok:false, reason:'busy' };
    claimsInFlight.add(mission.id);
    try{
      // dados frescos: o progresso pode ter mudado desde que a página abriu
      const fresh = await load(ctx.ev, ctx.me);
      fresh.x1 = ctx.x1;
      const st = evaluate(fresh, mission);
      if(mission.locked) return { ok:false, reason:'locked' };
      if(st.claimed) { Object.assign(ctx, fresh); return { ok:false, reason:'already' }; }
      if(!st.done) { Object.assign(ctx, fresh); return { ok:false, reason:'notdone' }; }

      const row = { event_id: ctx.ev.id, player_name: ctx.me, mission_id: mission.id,
                    xp: mission.xp || 0, currency: mission.miles || 0, coins: mission.coins || 0 };
      // 1) a constraint unique é o "compare-and-swap": 409 = já reclamada
      const res = await fetch(`${URL_}/rest/v1/event_claims`, {
        method: 'POST',
        headers: Object.assign(sbAuthHeaders(KEY_), { 'Content-Type':'application/json', 'Prefer':'return=representation' }),
        body: JSON.stringify([row])
      });
      if(res.status === 409){ const x1 = fresh.x1; Object.assign(ctx, await load(ctx.ev, ctx.me)); ctx.x1 = x1; return { ok:false, reason:'already' }; }
      if(!res.ok) return { ok:false, reason:'error' };
      const inserted = await res.json();
      const claimId = inserted && inserted[0] && inserted[0].id;

      // 2) paga as moedas; se falhar, desfaz a reclamação
      if(row.coins > 0){
        const paid = await adjustPlayerCoins(URL_, KEY_, ctx.me, row.coins, `Evento ${ctx.ev.name}: ${mission.title}`);
        if(!paid){
          if(claimId){
            try{ await fetch(`${URL_}/rest/v1/event_claims?id=eq.${enc(claimId)}`, { method:'DELETE', headers: sbAuthHeaders(KEY_) }); } catch(e){}
          }
          return { ok:false, reason:'payment' };
        }
      }
      logActivity(URL_, KEY_, 'jogador', ctx.me, 'evento', `Reclamou a missão "${mission.title}" (+${row.xp} XP, ${row.currency} milhas, 🪙${row.coins})`);

      const x1 = ctx.x1;
      Object.assign(ctx, await load(ctx.ev, ctx.me));
      ctx.x1 = x1;
      return { ok:true, rewards: { xp: row.xp, miles: row.currency, coins: row.coins } };
    } finally {
      claimsInFlight.delete(mission.id);
    }
  }

  // ---------- Prémios de nível ----------
  // Garante que o jogador tem todos os cosméticos dos níveis já atingidos. Devolve os ids NOVOS.
  async function syncLevelRewards(ctx, mod, ownedList){
    const lv = levelFor(mod, totals(ctx, ctx.me).xp).level;
    const want = mod.levels.filter(l => l.level <= lv).map(l => l.cosmeticId);
    const missing = ownedList ? want.filter(id => !ownedList.includes(id)) : want;
    if(!missing.length) return [];
    const r = await grantCosmetic(URL_, KEY_, ctx.me, missing);
    return r.added || [];
  }

  // ---------- Quadro de mensagens (cartões-postais) ----------
  const board = {
    MAX_LEN: 200,
    today: utcDay,
    async refresh(ctx){ ctx.board = await loadBoard(ctx.ev); return ctx.board; },
    // Um postal por jogador por dia — a constraint unique(event_id, author_name, day) garante-o.
    // Devolve {ok, reason}: 'empty' | 'toolong' | 'already' | 'unavailable' | 'error'
    async post(ctx, text){
      const body = String(text || '').replace(/\s+/g, ' ').trim();
      if(!body) return { ok:false, reason:'empty' };
      if(body.length > board.MAX_LEN) return { ok:false, reason:'toolong' };
      if(!ctx.board.available) return { ok:false, reason:'unavailable' };
      let res;
      try{
        res = await fetch(`${URL_}/rest/v1/event_messages`, {
          method:'POST',
          headers: Object.assign(sbAuthHeaders(KEY_), { 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
          body: JSON.stringify([{ event_id: ctx.ev.id, author_name: ctx.me, body, day: utcDay() }])
        });
      } catch(e){ return { ok:false, reason:'error' }; }
      if(res.status === 409) { await board.refresh(ctx); return { ok:false, reason:'already' }; }
      if(res.status === 404) return { ok:false, reason:'unavailable' };
      if(!res.ok) return { ok:false, reason:'error' };
      await board.refresh(ctx);
      logActivity(URL_, KEY_, 'jogador', ctx.me, 'evento', 'Deixou um cartão-postal no quadro do evento');
      return { ok:true };
    },
    // Reagir = toggle: mesmo emoji tira a reação; outro emoji troca (apaga e insere).
    async react(ctx, messageId, emoji){
      const msg = ctx.board.messages.find(m => m.id === messageId);
      if(!msg) return { ok:false, reason:'gone' };
      if(msg.author_name === ctx.me) return { ok:false, reason:'own' };
      const mine = ctx.board.reactions.find(r => r.message_id === messageId && r.reactor_name === ctx.me);
      try{
        if(mine){
          await fetch(`${URL_}/rest/v1/event_message_reactions?id=eq.${enc(mine.id)}`, { method:'DELETE', headers: sbAuthHeaders(KEY_) });
          if(mine.emoji === emoji){ await board.refresh(ctx); return { ok:true, removed:true }; }
        }
        const res = await fetch(`${URL_}/rest/v1/event_message_reactions`, {
          method:'POST',
          headers: Object.assign(sbAuthHeaders(KEY_), { 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
          body: JSON.stringify([{ event_id: ctx.ev.id, message_id: messageId, reactor_name: ctx.me, emoji }])
        });
        await board.refresh(ctx);
        return { ok: res.ok || res.status === 409 };
      } catch(e){ return { ok:false, reason:'error' }; }
    },
    // Agrupa por dia (mais recente primeiro) e junta as reações de cada mensagem.
    byDay(ctx){
      const rx = {};
      ctx.board.reactions.forEach(r => { (rx[r.message_id] = rx[r.message_id] || []).push(r); });
      const days = {};
      ctx.board.messages.forEach(m => {
        (days[m.day] = days[m.day] || []).push(Object.assign({}, m, { reactions: rx[m.id] || [] }));
      });
      return Object.keys(days).sort().reverse().map(day => ({ day, messages: days[day].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)) }));
    },
    hasPostedToday(ctx){ return ctx.board.messages.some(m => m.author_name === ctx.me && m.day === utcDay()); }
  };

  return { init, load, computeWeekStats, measure, expandMissions, evaluate, totals, levelFor, ranking, claimMission, syncLevelRewards, board, utcDay };
})();
