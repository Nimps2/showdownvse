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
    const [claims, tx, gifts, lottery, nick, preds, board, x1data, shopData, x1Board] = await Promise.all([
      getJson(`event_claims?event_id=eq.${enc(ev.id)}&select=id,player_name,mission_id,xp,currency,coins`, []),
      getJson(`coin_transactions?player_name=eq.${enc(me)}&created_at=gte.${since}&select=reason,amount,created_at`, []),
      getJson(`gifts?from_name=eq.${enc(me)}&created_at=gte.${since}&select=to_name,amount,created_at`, []),
      getJson(`lottery_tickets?buyer_name=eq.${enc(me)}&created_at=gte.${since}&select=ticket_count,created_at`, []),
      getJson(`activity_log?actor_name=eq.${enc(me)}&actor_type=eq.jogador&category=eq.palpite&action=like.${enc('Votou*Apelido da Semana')}&created_at=gte.${since}&select=created_at`, []),
      getJson(`predictions?predictor_name=eq.${enc(me)}&created_at=gte.${since}&select=tournament_id,match_id,predicted_winner,created_at`, []),
      loadBoard(ev),
      loadX1(ev, me),
      loadShop(ev, me),
      loadX1Board(ev)
    ]);
    const ctx = { ev, me, tournaments, claims, tx, gifts, lottery, nick, preds, board, x1: x1data.rows, x1Available: x1data.available, shop: shopData, x1Board };
    ctx.weekStats = computeWeekStats(ctx);
    ctx.windows = computeWindows(ctx);
    ctx.claimedIds = new Set(claims.filter(c => c.player_name === me).map(c => c.mission_id));
    return ctx;
  }

  // Recarrega tudo o que `load` trouxe, MANTENDO o mesmo objeto ctx (a página guarda coisas nele, ex. playerNames).
  async function refresh(ctx){
    const fresh = await load(ctx.ev, ctx.me);
    Object.keys(fresh).forEach(k => { ctx[k] = fresh[k]; });
    return ctx;
  }
  // "Impressão digital" do que se vê no ecrã: se não mudou, a página nem se redesenha.
  function signature(ctx){
    const tour = ctx.tournaments.map(t => t.id + ':' + t.status + ':' + ((t.data && t.data.matches) || []).map(m => m.winner || '').join(',')).join('|');
    const board = (ctx.board.messages || []).map(m => m.id).join(',') + '/' + (ctx.board.reactions || []).map(r => r.id + r.emoji).join(',');
    const x1 = (ctx.x1 || []).map(r => [r.id, r.status, r.replay_path || '', r.reported_winner || ''].join(':')).join(',');
    const shop = ctx.shop ? ctx.shop.purchases.map(p => p.item_id).join(',') : '';
    const duels = (ctx.x1Board || []).map(x => x.reported_winner + x.challenger_name + x.opponent_name).join(',');
    return [tour, ctx.claims.length, ctx.tx.length, ctx.gifts.length, ctx.lottery.length, ctx.nick.length, ctx.preds.length, board, x1, shop, duels].join('#');
  }

  // Todos os x1 CONFIRMADOS do evento (de toda a gente, com vencedor): alimentam a "Corrida ao Rei dos Duelos" (EventCore.x1.leaders).
  async function loadX1Board(ev){
    const r = await getJsonStatus(`x1_challenges?event_id=eq.${enc(ev.id)}&status=in.(confirmed,resolved)&select=challenger_name,opponent_name,reported_winner&limit=5000`);
    return r.ok ? r.data.filter(x => x.reported_winner) : [];
  }

  // Loja de Milhas: o que se vende (event_shop_items, com o PREÇO) e as compras deste jogador (event_purchases).
  // Se as tabelas ainda não existem (SQL por correr) ou não há itens, {available:false} e o separador não aparece.
  async function loadShop(ev, me){
    const [items, purchases] = await Promise.all([
      getJsonStatus(`event_shop_items?event_slug=eq.${enc(ev.slug)}&select=item_id,cost,sort_order&order=sort_order.asc`),
      getJsonStatus(`event_purchases?event_id=eq.${enc(ev.id)}&player_name=eq.${enc(me)}&select=item_id,cost,created_at`)
    ]);
    if(!items.ok || !purchases.ok) return { available:false, items:[], purchases:[] };
    return { available: items.data.length > 0, items: items.data, purchases: purchases.data };
  }

  async function loadBoard(ev){
    const m = await getJsonStatus(`event_messages?event_id=eq.${enc(ev.id)}&select=id,created_at,author_name,body,day&order=created_at.desc&limit=400`);
    if(!m.ok) return { available:false, messages:[], reactions:[] };
    const r = await getJson(`event_message_reactions?event_id=eq.${enc(ev.id)}&select=id,message_id,reactor_name,emoji,created_at&limit=3000`, []);
    return { available:true, messages: m.data, reactions: r };
  }

  // Desafios x1 em que o jogador participa (como desafiante E como adversário) — 2 pedidos em vez de `or=`
  // porque os nomes podem ter caracteres especiais. Tabela em falta -> {available:false}.
  async function loadX1(ev, me){
    const base = `x1_challenges?event_id=eq.${enc(ev.id)}&select=*&order=created_at.desc&limit=300`;
    const [a, b] = await Promise.all([ getJsonStatus(`${base}&challenger_name=eq.${enc(me)}`), getJsonStatus(`${base}&opponent_name=eq.${enc(me)}`) ]);
    if(!a.ok || !b.ok) return { available:false, rows:[] };
    const seen = new Set(), rows = [];
    a.data.concat(b.data).forEach(r => { if(!seen.has(r.id)){ seen.add(r.id); rows.push(r); } });
    rows.sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));
    return { available:true, rows };
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
      // --- x1 do evento inteiro (todas as semanas) ---
      case 'x1playedAll': return { value: x1Mine(ctx).filter(isConfirmed).length, target };
      case 'x1winsAll':   return { value: x1Mine(ctx).filter(x => isConfirmed(x) && winnerOf(x) === ctx.me).length, target };
      case 'x1opponents': return { value: new Set(x1Mine(ctx).filter(isConfirmed).map(x => x.challenger_name === ctx.me ? x.opponent_name : x.challenger_name)).size, target };
      default:            return { value: 0, target };
    }
  }
  function x1Mine(ctx){ return (ctx.x1 || []).filter(x => x.challenger_name === ctx.me || x.opponent_name === ctx.me); }
  function isConfirmed(x){ return (x.status === 'confirmed' || x.status === 'resolved') && !!winnerOf(x); }
  function winnerOf(x){ return x.reported_winner || null; }
  function x1Count(ctx, week, pred){
    return (ctx.x1 || []).filter(x => x.week === week && (x.challenger_name === ctx.me || x.opponent_name === ctx.me) && pred(x)).length;
  }

  // Expande a definição do módulo numa lista plana de missões concretas.
  // Semanas que ainda não abriram (week > current_week) saem marcadas como `locked`.
  // Missões do quadro só aparecem se as tabelas do quadro existirem.
  function expandMissions(mod, ev, opts, ctx){
    const x1On = !!(opts && opts.x1) && (!ctx || ctx.x1Available !== false);
    const boardOn = !ctx || ctx.board.available;
    const list = [];
    mod.weeks.forEach((w, i) => {
      const week = i + 1;
      mod.missions.weekly.forEach(def => {
        if(def.needs === 'x1' && !x1On) return;
        if(def.needs === 'board' && !boardOn) return;
        list.push(Object.assign({}, def, { id: `w${week}_${def.key}`, scope: 'week', week, locked: week > ev.current_week,
          grantsCosmeticId: def.grants ? def.grants[week] : undefined }));
      });
    });
    mod.missions.event.forEach(def => {
      if(def.needs === 'board' && !boardOn) return;
      if(def.needs === 'x1' && !x1On) return;
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
  // `miles` = Milhas GANHAS (é o que conta para o ranking); `balance` = ganhas menos gastas na loja (só se conhecem as compras do próprio jogador).
  function totals(ctx, name){
    let xp = 0, miles = 0, coins = 0, spent = 0;
    ctx.claims.forEach(c => { if(c.player_name === name){ xp += c.xp || 0; miles += c.currency || 0; coins += c.coins || 0; } });
    if(name === ctx.me && ctx.shop) ctx.shop.purchases.forEach(p => { spent += p.cost || 0; });
    return { xp, miles, coins, spent, balance: miles - spent };
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
      if(res.status === 409){ Object.assign(ctx, await load(ctx.ev, ctx.me)); return { ok:false, reason:'already' }; }
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

      // 3) cosmético ligado à missão (ex.: título "Campeão de Kanto"); se falhar, o sync da página tenta de novo
      let granted = [];
      if(mission.grantsCosmeticId){
        const g = await grantCosmetic(URL_, KEY_, ctx.me, [mission.grantsCosmeticId]);
        granted = g.added || [];
      }
      Object.assign(ctx, await load(ctx.ev, ctx.me));
      return { ok:true, rewards: { xp: row.xp, miles: row.currency, coins: row.coins }, granted };
    } finally {
      claimsInFlight.delete(mission.id);
    }
  }

  // ---------- Prémios de nível ----------
  // Garante que o jogador tem todos os cosméticos dos níveis já atingidos. Devolve os ids NOVOS.
  async function syncLevelRewards(ctx, mod, ownedList){
    const lv = levelFor(mod, totals(ctx, ctx.me).xp).level;
    const want = mod.levels.filter(l => l.level <= lv).map(l => l.cosmeticId);
    expandMissions(mod, ctx.ev, { x1: true }, ctx).forEach(m => {
      if(m.grantsCosmeticId && ctx.claimedIds.has(m.id) && !want.includes(m.grantsCosmeticId)) want.push(m.grantsCosmeticId);
    });
    const missing = ownedList ? want.filter(id => !ownedList.includes(id)) : want;
    if(!missing.length) return [];
    const r = await grantCosmetic(URL_, KEY_, ctx.me, missing);
    return r.added || [];
  }

  // ---------- Desafios x1 ----------
  // Fluxo: pending -> accepted -> reported -> confirmed ; ramos: declined, cancelled, disputed -> resolved (organizador).
  // Cada transição é um PATCH condicional ao estado anterior (status=eq.<anterior>): se outra pessoa mudou
  // entretanto, a resposta vem vazia e devolvemos 'changed' (o ecrã recarrega).
  const X1_DEAD = ['declined', 'cancelled'];
  const x1 = {
    MAX_PER_WEEK: 5,   // desafios enviados por jogador por semana (os textos leem daqui; a base de dados também o garante: x1_max_per_week() no SQL mestre — mudar nos dois)
    sentThisWeek(ctx){ return ctx.x1.filter(r => r.challenger_name === ctx.me && r.week === ctx.ev.current_week && !X1_DEAD.includes(r.status)); },
    quota(ctx){ const sent = x1.sentThisWeek(ctx); return { used: sent.length, max: x1.MAX_PER_WEEK, left: Math.max(0, x1.MAX_PER_WEEK - sent.length), opponents: new Set(sent.map(r => r.opponent_name)) }; },
    // Devolve null se pode enviar, ou o motivo: 'noweek' | 'self' | 'noname' | 'quota' | 'dup'
    cannotSend(ctx, opponent){
      if(ctx.ev.current_week < 1) return 'noweek';
      if(!opponent) return 'noname';
      if(opponent === ctx.me) return 'self';
      const q = x1.quota(ctx);
      if(q.left <= 0) return 'quota';
      if(q.opponents.has(opponent)) return 'dup';
      return null;
    },
    async refresh(ctx){ const r = await loadX1(ctx.ev, ctx.me); ctx.x1 = r.rows; ctx.x1Available = r.available; ctx.x1Board = await loadX1Board(ctx.ev); return r; },
    // Corrida ao "Rei dos Duelos": quem tem mais vitórias em x1 confirmados no evento (desempate: mais jogos, depois o nome).
    leaders(ctx){
      const map = {};
      (ctx.x1Board || []).forEach(x => {
        [x.challenger_name, x.opponent_name].forEach(n => { (map[n] || (map[n] = { name: n, wins: 0, played: 0 })).played++; });
        if(map[x.reported_winner]) map[x.reported_winner].wins++;
      });
      return Object.values(map).sort((a, b) => b.wins - a.wins || b.played - a.played || a.name.localeCompare(b.name));
    },
    async send(ctx, opponent){
      await x1.refresh(ctx); // quota com dados frescos
      const why = x1.cannotSend(ctx, opponent);
      if(why) return { ok:false, reason: why };
      let res;
      try{
        res = await fetch(`${URL_}/rest/v1/x1_challenges`, {
          method:'POST',
          headers: Object.assign(sbAuthHeaders(KEY_), { 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
          body: JSON.stringify([{ event_id: ctx.ev.id, week: ctx.ev.current_week, challenger_name: ctx.me, opponent_name: opponent, status: 'pending' }])
        });
      } catch(e){ return { ok:false, reason:'error' }; }
      if(!res.ok){
        // a própria base de dados recusa (gatilho x1_rules): quota cheia, adversário repetido ou auto-desafio
        let txt = ''; try{ txt = await res.text(); } catch(e){}
        const reason = /x1_quota/.test(txt) ? 'quota' : /x1_dup/.test(txt) ? 'dup' : /x1_self/.test(txt) ? 'self' : 'error';
        if(reason !== 'error') await x1.refresh(ctx);
        return { ok:false, reason };
      }
      await x1.refresh(ctx);
      logActivity(URL_, KEY_, 'jogador', ctx.me, 'evento', `Desafiou ${opponent} para um x1 (semana ${ctx.ev.current_week})`);
      return { ok:true };
    },
    // Só aceita links de replays do Showdown (https://replay.pokemonshowdown.com/<id>): o que um jogador escreve aqui
    // aparece como link para todos, por isso nada de endereços arbitrários. '' = sem link; null = inválido.
    cleanReplayUrl(v){
      v = String(v || '').trim();
      if(!v) return '';
      v = v.split('#')[0].split('?')[0];
      return /^https:\/\/replay\.pokemonshowdown\.com\/[A-Za-z0-9._~\/-]+$/.test(v) ? v : null;
    },
    async _go(ctx, id, from, patch, logText, extraFilter){
      let res;
      try{
        res = await fetch(`${URL_}/rest/v1/x1_challenges?id=eq.${enc(id)}&status=eq.${from}${extraFilter || ''}`, {
          method:'PATCH',
          headers: Object.assign(sbAuthHeaders(KEY_), { 'Content-Type':'application/json', 'Prefer':'return=representation' }),
          body: JSON.stringify(patch)
        });
      } catch(e){ return { ok:false, reason:'error' }; }
      if(!res.ok) return { ok:false, reason:'error' };
      const rows = await res.json();
      await x1.refresh(ctx);
      if(!rows || !rows.length) return { ok:false, reason:'changed' };   // outra pessoa mudou o estado primeiro
      if(logText) logActivity(URL_, KEY_, 'jogador', ctx.me, 'evento', logText);
      return { ok:true, row: rows[0] };
    },
    get(ctx, id){ return ctx.x1.find(r => r.id === id) || null; },
    // O adversário aceita ou recusa
    respond(ctx, id, accept){
      const r = x1.get(ctx, id);
      if(!r || r.opponent_name !== ctx.me) return Promise.resolve({ ok:false, reason:'notyours' });
      return x1._go(ctx, id, 'pending', accept ? { status:'accepted', accepted_at: new Date().toISOString() } : { status:'declined' },
        `${accept ? 'Aceitou' : 'Recusou'} o desafio x1 de ${r.challenger_name}`);
    },
    // Quem enviou pode cancelar enquanto ninguém respondeu
    cancel(ctx, id){
      const r = x1.get(ctx, id);
      if(!r || r.challenger_name !== ctx.me) return Promise.resolve({ ok:false, reason:'notyours' });
      return x1._go(ctx, id, 'pending', { status:'cancelled' }, `Cancelou o desafio x1 a ${r.opponent_name}`);
    },
    // Qualquer um dos dois regista quem ganhou (só depois de aceite)
    report(ctx, id, winner, replayUrl){
      const r = x1.get(ctx, id);
      if(!r || (r.challenger_name !== ctx.me && r.opponent_name !== ctx.me)) return Promise.resolve({ ok:false, reason:'notyours' });
      if(winner !== r.challenger_name && winner !== r.opponent_name) return Promise.resolve({ ok:false, reason:'badwinner' });
      const url = x1.cleanReplayUrl(replayUrl);
      if(url === null) return Promise.resolve({ ok:false, reason:'badreplay' });
      const patch = { status:'reported', reported_winner: winner, reported_by: ctx.me, reported_at: new Date().toISOString() };
      if(url) patch.replay_path = url;
      return x1._go(ctx, id, 'accepted', patch,
        `Registou o resultado do x1 ${r.challenger_name} vs ${r.opponent_name}: vitória de ${winner}`);
    },
    // Quem jogou pode juntar o link do replay depois (só se ainda não houver nenhum; o organizador pode sempre mudar no gestor)
    addReplay(ctx, id, replayUrl){
      const r = x1.get(ctx, id);
      if(!r || (r.challenger_name !== ctx.me && r.opponent_name !== ctx.me)) return Promise.resolve({ ok:false, reason:'notyours' });
      if(r.replay_path || !['reported', 'confirmed', 'resolved'].includes(r.status)) return Promise.resolve({ ok:false, reason:'notyet' });
      const url = x1.cleanReplayUrl(replayUrl);
      if(!url) return Promise.resolve({ ok:false, reason:'badreplay' });
      return x1._go(ctx, id, r.status, { replay_path: url }, `Juntou o replay do x1 ${r.challenger_name} vs ${r.opponent_name}`, '&replay_path=is.null');
    },
    // O OUTRO jogador (não quem registou) confirma ou contesta
    confirm(ctx, id){
      const r = x1.get(ctx, id);
      if(!r || (r.challenger_name !== ctx.me && r.opponent_name !== ctx.me) || r.reported_by === ctx.me) return Promise.resolve({ ok:false, reason:'notyours' });
      return x1._go(ctx, id, 'reported', { status:'confirmed', confirmed_at: new Date().toISOString() },
        `Confirmou o resultado do x1 ${r.challenger_name} vs ${r.opponent_name}`);
    },
    dispute(ctx, id, note){
      const r = x1.get(ctx, id);
      if(!r || (r.challenger_name !== ctx.me && r.opponent_name !== ctx.me) || r.reported_by === ctx.me) return Promise.resolve({ ok:false, reason:'notyours' });
      return x1._go(ctx, id, 'reported', { status:'disputed', note: String(note || '').slice(0, 200) || null },
        `Contestou o resultado do x1 ${r.challenger_name} vs ${r.opponent_name}`);
    },
    // Para a vista: o que este jogador pode/deve fazer neste desafio
    actionsFor(ctx, r){
      const mine = r.challenger_name === ctx.me, theirs = r.opponent_name === ctx.me;
      if(!mine && !theirs) return [];
      if(r.status === 'pending') return theirs ? ['accept', 'decline'] : ['cancel'];
      if(r.status === 'accepted') return ['win', 'lose'];
      if(r.status === 'reported') return r.reported_by === ctx.me ? [] : ['confirm', 'dispute'];
      return [];
    },
    // Quantos precisam de ti agora (para o selo do separador)
    waitingOnMe(ctx){
      return ctx.x1.filter(r => r.status === 'pending' ? r.opponent_name === ctx.me
        : r.status === 'reported' ? (r.reported_by !== ctx.me && (r.challenger_name === ctx.me || r.opponent_name === ctx.me)) : false).length;
    },
    winnerOf, isConfirmed
  };

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
    // Atualização "ao vivo" (a cada ~5 s com o quadro aberto): só pede o que é NOVO desde a última vez (mensagens e
    // reações com created_at >= o mais recente que já temos; repetidos filtram-se pelo id). Apagados (moderação) e
    // reações retiradas não aparecem assim, por isso de 6 em 6 chamadas faz uma recarga completa.
    // Devolve { changed, newIds } — newIds = postais novos de OUTROS jogadores (para o destaque no ecrã).
    async live(ctx){
      const b = ctx.board;
      if(!b || !b.available) return { changed:false, newIds:[] };
      const before = new Set(b.messages.map(m => m.id));
      const sig = b.messages.length + '/' + b.reactions.length + '/' + b.reactions.map(r => r.id + r.emoji).join(',');
      const n = (b._n || 0) + 1;
      if(n % 6 === 0){
        const full = await loadBoard(ctx.ev);
        if(!full.available) return { changed:false, newIds:[] };
        full._n = n; ctx.board = full;
      } else {
        // 30 s de margem para trás: apanha linhas gravadas "fora de ordem"; os repetidos filtram-se pelo id.
        const since = arr => { const t = arr.reduce((mx, x) => Math.max(mx, Date.parse(x.created_at) || 0), 0); return enc(new Date(Math.max(0, (t || 0) - 30000)).toISOString()); };
        const [m, r] = await Promise.all([
          getJsonStatus(`event_messages?event_id=eq.${enc(ctx.ev.id)}&created_at=gte.${since(b.messages)}&select=id,created_at,author_name,body,day&order=created_at.desc&limit=100`),
          getJsonStatus(`event_message_reactions?event_id=eq.${enc(ctx.ev.id)}&created_at=gte.${since(b.reactions)}&select=id,message_id,reactor_name,emoji,created_at&limit=500`)
        ]);
        if(!m.ok || !r.ok){ b._n = n; return { changed:false, newIds:[] }; }
        m.data.forEach(x => { if(!b.messages.some(y => y.id === x.id)) b.messages.unshift(x); });
        r.data.forEach(x => {
          if(b.reactions.some(y => y.id === x.id)) return;
          // trocar de emoji = apagar + inserir: a nova substitui a anterior da mesma pessoa
          b.reactions = b.reactions.filter(y => !(y.message_id === x.message_id && y.reactor_name === x.reactor_name));
          b.reactions.push(x);
        });
        b._n = n;
      }
      const after = ctx.board;
      const sig2 = after.messages.length + '/' + after.reactions.length + '/' + after.reactions.map(r => r.id + r.emoji).join(',');
      const newIds = after.messages.filter(m => !before.has(m.id) && m.author_name !== ctx.me).map(m => m.id);
      return { changed: sig !== sig2, newIds };
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

  // ---------- Loja de Milhas ----------
  // A compra é UMA função da base de dados (buy_event_item): bloqueia o jogador, confere o saldo (Milhas ganhas - gastas), regista a
  // compra e junta o cosmético ao perfil. O preço vem da base (event_shop_items), nunca do site. Exige o bilhete de login do jogador.
  // Devolve {ok, balance, cost} ou {ok:false, reason: 'insufficient'|'alreadyowned'|'closed'|'noitem'|'auth'|'busy'|'error', balance?}
  const buysInFlight = new Set();
  const shop = {
    async buy(ctx, itemId){
      if(buysInFlight.has(itemId)) return { ok:false, reason:'busy' };
      buysInFlight.add(itemId);
      try{
        const r = await dbFunction(URL_, KEY_, 'buy_event_item', { p_name: ctx.me, p_event: ctx.ev.id, p_item: itemId, p_token: getPlayerToken(ctx.me) });
        if(!r.ok || !r.data) return { ok:false, reason:'error' };
        if(r.data.reason === 'auth'){ handleSessionExpired(); return { ok:false, reason:'auth' }; }
        if(!r.data.ok) return { ok:false, reason: r.data.reason || 'error', balance: r.data.balance };
        const c = getCosmeticById(itemId);
        logActivity(URL_, KEY_, 'jogador', ctx.me, 'evento', `Comprou na loja de Milhas: "${c ? c.name : itemId}" (${r.data.cost} milhas)`);
        const fresh = await loadShop(ctx.ev, ctx.me);
        ctx.shop = fresh;
        return { ok:true, balance: r.data.balance, cost: r.data.cost };
      } finally {
        buysInFlight.delete(itemId);
      }
    }
  };

  return { init, load, refresh, signature, computeWeekStats, measure, expandMissions, evaluate, totals, levelFor, ranking, claimMission, syncLevelRewards, board, x1, shop, utcDay };
})();
