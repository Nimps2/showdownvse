// showdown-utils.js
// Funções utilitárias partilhadas entre o gestor (torneio_showdown.html) e o
// viewer (index.html / torneio_viewer.html) do Torneio Showdown - VSE.
//
// Estas funções são "puras" (não dependem de estado específico de cada página,
// como TIER_DATA, drawsState, currentData, etc.), por isso é seguro serem
// partilhadas sem qualquer risco de um ficheiro interferir no outro.
//
// Se precisares de corrigir algo relacionado com o parser de imports do
// Showdown, faz a alteração aqui — os dois ficheiros HTML apanham a correção
// automaticamente, sem teres de duplicar a mudança duas vezes.

function escapeHtml(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function copyText(id, btn){
  const txt = document.getElementById(id).innerText;
  navigator.clipboard.writeText(txt).then(()=>{
    const msg = btn.nextElementSibling;
    if(msg){ msg.classList.add('show'); setTimeout(()=>msg.classList.remove('show'), 1500); }
  });
}

// ---------- Parser: importar texto colado no formato do Showdown ----------
function parseStatString(str){
  const out = {};
  str.split('/').forEach(part=>{
    const m = part.trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
    if(m) out[m[2].toLowerCase()] = parseInt(m[1],10);
  });
  return out;
}

function parseShowdownImport(text){
  const lines = text.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
  if(!lines.length) return null;
  const result = { name:null, item:null, ability:null, nature:null, evs:{}, ivs:{}, teraType:null, moves:[] };

  const first = lines[0];
  let namePart = first, item = null;
  const atIdx = first.indexOf(' @ ');
  if(atIdx !== -1){
    namePart = first.slice(0, atIdx).trim();
    item = first.slice(atIdx+3).trim();
  }
  const nickMatch = namePart.match(/^(.*?)\s*\(([^)]+)\)\s*(?:\((?:M|F)\))?$/i);
  let species = namePart;
  if(nickMatch && nickMatch[2] && !/^(M|F)$/i.test(nickMatch[2])){
    species = nickMatch[2].trim();
  }
  species = species.replace(/\s*\((M|F)\)\s*$/i,'').trim();
  result.name = species;
  result.item = item;

  for(let i=1;i<lines.length;i++){
    const line = lines[i];
    let m;
    if((m = line.match(/^Ability:\s*(.+)$/i))){ result.ability = m[1].trim(); continue; }
    if((m = line.match(/^EVs:\s*(.+)$/i))){ result.evs = parseStatString(m[1]); continue; }
    if((m = line.match(/^IVs:\s*(.+)$/i))){ result.ivs = parseStatString(m[1]); continue; }
    if((m = line.match(/^Tera Type:\s*(.+)$/i))){ result.teraType = m[1].trim(); continue; }
    if((m = line.match(/^([A-Za-z]+)\s+Nature$/i))){ result.nature = m[1].trim(); continue; }
    if(/^Level:/i.test(line) || /^Shiny:/i.test(line) || /^Happiness:/i.test(line)){ continue; }
    if((m = line.match(/^-\s*(.+)$/))){ result.moves.push(m[1].trim()); continue; }
  }
  return result;
}

// ---------- Estatísticas: agregação de resultados por jogador ----------
// Usado por estatisticas.html e perfil.html. Recebe as linhas devolvidas pelo
// Supabase (cada uma com tier/status/created_at/data) e devolve um objeto
// { nomeDoJogador: { wins, losses, titles, titlesByTier, tournaments:[...] } }
function aggregatePlayers(rows){
  const playerStats = {};
  rows.forEach(r=>{
    const data = r.data || {};
    const tier = data.tier || r.tier || '?';
    const tName = data.name || null;
    const createdAt = r.created_at;
    const players = (data.players || []).filter(p=>p);
    const matches = data.matches || [];
    const champion = data.champion || null;

    players.forEach(p=>{
      if(!playerStats[p]) playerStats[p] = { wins:0, losses:0, titles:0, titlesByTier:{}, tournaments:[] };
    });

    matches.forEach(m=>{
      if(!m.winner || !m.p1 || !m.p2) return;
      const loser = m.winner === m.p1 ? m.p2 : m.p1;
      if(playerStats[m.winner]) playerStats[m.winner].wins++;
      if(playerStats[loser]) playerStats[loser].losses++;
    });

    players.forEach(p=>{
      let resultLabel = 'Sem partidas registradas';
      let isChamp = false;
      if(champion === p){
        resultLabel = 'Campeão';
        isChamp = true;
        playerStats[p].titles++;
        playerStats[p].titlesByTier[tier] = (playerStats[p].titlesByTier[tier]||0)+1;
      } else {
        const lostMatch = matches.find(m=>m.winner && (m.p1===p || m.p2===p) && m.winner!==p);
        if(lostMatch) resultLabel = `Eliminado — ${lostMatch.label}`;
        else {
          const anyMatch = matches.find(m=>m.p1===p||m.p2===p);
          if(anyMatch && !anyMatch.winner) resultLabel = 'Em curso';
        }
      }
      const playerMatches = matches
        .filter(m => m.winner && (m.p1===p || m.p2===p))
        .map(m => ({
          label: m.label,
          opponent: m.p1===p ? m.p2 : m.p1,
          won: m.winner === p,
          replayUrls: m.replayUrls || (m.replayUrl ? [m.replayUrl] : [])
        }));
      playerStats[p].tournaments.push({ name: tName, tier, createdAt, result: resultLabel, isChamp, matches: playerMatches });
    });
  });
  return playerStats;
}

// ---------- Estatísticas: Pokémon usados por UM jogador específico ----------
// Devolve { mons: {nome: count}, moves: {golpe: count} } considerando os 4
// sorteados + as 2 escolhas livres desse jogador em todos os torneios.
function aggregatePlayerPokemon(rows, playerName){
  const mons = {};
  const moves = {};
  function tally(name, item){
    mons[name] = (mons[name]||0)+1;
    let mv = item.moves;
    if((!mv || !mv.length) && item.text){
      const parsed = parseShowdownImport(item.text);
      if(parsed) mv = parsed.moves;
    }
    (mv||[]).forEach(m=>{ moves[m] = (moves[m]||0)+1; });
  }
  rows.forEach(r=>{
    const data = r.data || {};
    const idx = (data.players||[]).indexOf(playerName);
    if(idx === -1) return;
    const entry = (data.draws||{})[idx];
    if(!entry) return;
    (entry.random||[]).forEach(item=>{ if(item.mon) tally(item.mon, item); });
    (entry.free||[]).forEach(item=>{ if(item.name) tally(item.name, item); });
  });
  return { mons, moves };
}

// ---------- Login por jogador (nome + password) ----------
// Partilhado por viewer.html, estatisticas.html e perfil.html.
async function sha256Hex(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function sbAuthHeaders(supabaseAnonKey){
  return { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` };
}

// Devolve {ok:true} ou {ok:false, reason:'notfound'|'wrongpass'|'network'}
// Nota: a coluna "password_hash" na tabela players guarda a password em texto
// simples (decisão deliberada — ver conversa sobre o botão "Revelar password"
// no gestor). O nome da coluna ficou por compatibilidade, mas já não é um hash.
async function verifyPlayerLogin(supabaseUrl, supabaseAnonKey, name, password){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=password_hash`, {
      headers: sbAuthHeaders(supabaseAnonKey)
    });
    if(!res.ok) return {ok:false, reason:'network'};
    const rows = await res.json();
    if(!rows || !rows[0]) return {ok:false, reason:'notfound'};
    if(password !== rows[0].password_hash) return {ok:false, reason:'wrongpass'};
    return {ok:true};
  } catch(e){
    return {ok:false, reason:'network'};
  }
}

async function fetchRegisteredPlayerNames(supabaseUrl, supabaseAnonKey){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?select=name&order=name.asc`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return [];
  const rows = await res.json();
  return rows.map(r=>r.name);
}

// ---------- Perfil: apelido, foto (por link), mensagem de estado, moedas e personalização ----------
// Devolve um mapa { nomeReal: {nickname, photo_url, status_message, coins, ownedCosmetics, equippedBackground, equippedAccent} }.
async function fetchPlayerProfiles(supabaseUrl, supabaseAnonKey){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?select=name,nickname,photo_url,status_message,coins,owned_cosmetics,equipped_background,equipped_accent,equipped_frame,equipped_name_effect,equipped_title,equipped_badges,profile_background_url,guaranteed_bye,elo_chart_unlocked`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return {};
  const rows = await res.json();
  const map = {};
  rows.forEach(r=>{
    map[r.name] = {
      nickname: r.nickname || null, photo_url: r.photo_url || null, status_message: r.status_message || null,
      coins: r.coins || 0, ownedCosmetics: r.owned_cosmetics || [],
      equippedBackground: r.equipped_background || null, equippedAccent: r.equipped_accent || null,
      equippedFrame: r.equipped_frame || null, equippedNameEffect: r.equipped_name_effect || null,
      equippedTitle: r.equipped_title || null, equippedBadges: r.equipped_badges || [],
      profileBackgroundUrl: r.profile_background_url || null, guaranteedBye: !!r.guaranteed_bye,
      eloChartUnlocked: !!r.elo_chart_unlocked
    };
  });
  return map;
}

async function updatePlayerProfile(supabaseUrl, supabaseAnonKey, name, nickname, photoUrl, statusMessage){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ nickname: nickname || null, photo_url: photoUrl || null, status_message: statusMessage || null })
  });
  return res.ok;
}

// ---------- Loja de personalização ----------
const COSMETIC_CATALOG = {
  backgrounds: [
    { id:'bg_default',  name:'Padrão',       price:0,   css:'linear-gradient(135deg,#a56bf0,#4fd8d0)' },
    { id:'bg_sunset',   name:'Pôr do Sol',   price:50,  css:'linear-gradient(135deg,#f0b64f,#e0607a)' },
    { id:'bg_ocean',    name:'Oceano',       price:50,  css:'linear-gradient(135deg,#0e9488,#4fd8d0)' },
    { id:'bg_galaxy',   name:'Galáxia',      price:80,  css:'linear-gradient(135deg,#7c4dc4,#1a1d29)' },
    { id:'bg_fire',     name:'Fogo',         price:80,  css:'linear-gradient(135deg,#e0607a,#f0b64f)' },
    { id:'bg_gold',     name:'Ouro Puro',    price:150, css:'linear-gradient(135deg,#f0b64f,#b8860b)' }
  ],
  accents: [
    { id:'accent_default', name:'Ciano (padrão)', price:0,  color:'#4fd8d0' },
    { id:'accent_violet',  name:'Violeta',        price:30, color:'#a56bf0' },
    { id:'accent_amber',   name:'Âmbar',          price:30, color:'#f0b64f' },
    { id:'accent_rose',    name:'Rosa',           price:30, color:'#e0607a' },
    { id:'accent_emerald', name:'Esmeralda',      price:50, color:'#5ed890' }
  ],
  frames: [
    { id:'frame_none',  name:'Sem moldura',   price:0,   border:'none' },
    { id:'frame_gold',  name:'Moldura Dourada', price:60,  border:'3px solid #f0b64f' },
    { id:'frame_neon',  name:'Moldura Neon',    price:60,  border:'3px solid #4fd8d0' },
    { id:'frame_royal', name:'Moldura Real',    price:100, border:'3px solid #a56bf0' }
  ],
  nameEffects: [
    { id:'effect_none',  name:'Nenhum',  price:0,  css:'' },
    { id:'effect_glow',  name:'Brilho',  price:70, css:'text-shadow:0 0 8px currentColor;' },
    { id:'effect_pulse', name:'Pulsar',  price:90, css:'animation:vsePulseName 1.5s ease-in-out infinite;' }
  ],
  titles: [
    { id:'title_none',         name:'Nenhum',              price:0,  text:'' },
    { id:'title_playin_king',  name:'Rei do Play-in',      price:40, text:'👑 Rei do Play-in' },
    { id:'title_bo3_legend',   name:'Lenda da Bo3',        price:40, text:'⚔️ Lenda da Bo3' },
    { id:'title_wall',         name:'Muralha Ambulante',   price:40, text:'🧱 Muralha Ambulante' },
    { id:'title_underdog',     name:'Zebra do Torneio',    price:40, text:'🦓 Zebra do Torneio' }
  ],
  badges: [
    { id:'badge_stall',   name:'Fã de Stall',   price:30, emoji:'🐌' },
    { id:'badge_speed',   name:'Speedrunner',   price:30, emoji:'⚡' },
    { id:'badge_lucky',   name:'Sortudo',       price:30, emoji:'🍀' },
    { id:'badge_veteran', name:'Veterano',      price:50, emoji:'🎖️' }
  ],
  features: [
    { id:'feature_custom_pagebg', name:'Fundo de perfil personalizado (foto)', price:120 }
  ]
};
const MAX_EQUIPPED_BADGES = 3;

function getCosmeticById(id){
  if(!id) return null;
  for(const category of Object.values(COSMETIC_CATALOG)){
    const found = category.find(c=>c.id===id);
    if(found) return found;
  }
  return null;
}

// Devolve {ok, reason} — 'insufficient' (moedas a menos) | 'alreadyowned' | 'notfound' | true
async function buyCosmetic(supabaseUrl, supabaseAnonKey, name, cosmeticId){
  const item = getCosmeticById(cosmeticId);
  if(!item) return {ok:false, reason:'notfound'};
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins,owned_cosmetics`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'notfound'};
  const current = rows[0];
  const owned = current.owned_cosmetics || [];
  if(owned.includes(cosmeticId)) return {ok:false, reason:'alreadyowned'};
  if((current.coins||0) < item.price) return {ok:false, reason:'insufficient'};

  const newCoins = (current.coins||0) - item.price;
  const newOwned = owned.concat([cosmeticId]);
  const patchRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ coins: newCoins, owned_cosmetics: newOwned })
  });
  if(patchRes.ok && item.price > 0){
    await logCoinTransaction(supabaseUrl, supabaseAnonKey, name, -item.price, `Compra na loja: ${item.name}`);
  }
  return {ok: patchRes.ok};
}

// type: 'background' | 'accent' | 'frame' | 'nameEffect' | 'title'
async function equipCosmetic(supabaseUrl, supabaseAnonKey, name, type, cosmeticId){
  const fieldMap = {
    background: 'equipped_background', accent: 'equipped_accent', frame: 'equipped_frame',
    nameEffect: 'equipped_name_effect', title: 'equipped_title'
  };
  const field = fieldMap[type];
  if(!field) return false;
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ [field]: cosmeticId })
  });
  return res.ok;
}

// Liga/desliga um emblema equipado (até MAX_EQUIPPED_BADGES ao mesmo tempo).
async function toggleBadge(supabaseUrl, supabaseAnonKey, name, badgeId, currentEquipped){
  let newBadges;
  if(currentEquipped.includes(badgeId)){
    newBadges = currentEquipped.filter(b=>b!==badgeId);
  } else {
    if(currentEquipped.length >= MAX_EQUIPPED_BADGES) return {ok:false, reason:'limit'};
    newBadges = currentEquipped.concat([badgeId]);
  }
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ equipped_badges: newBadges })
  });
  return {ok: res.ok};
}

// Define o link da foto usada como fundo do perfil (só faz sentido depois de
// comprar o item 'feature_custom_pagebg').
async function setProfileBackgroundUrl(supabaseUrl, supabaseAnonKey, name, url){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ profile_background_url: url || null })
  });
  return res.ok;
}

// Devolve HTML de um avatar: <img> se houver photo_url, senão um círculo com
// as iniciais, usando o fundo e a moldura personalizados equipados (se existirem).
function avatarHtml(name, photoUrl, sizePx, backgroundCss, frameBorder){
  const size = sizePx || 44;
  const border = frameBorder && frameBorder !== 'none' ? `border:${frameBorder};` : '';
  if(photoUrl){
    return `<img src="${photoUrl.replace(/"/g,'&quot;')}" alt="${(name||'').replace(/"/g,'&quot;')}" style="width:${size}px;height:${size}px;border-radius:${Math.round(size*0.28)}px;object-fit:cover;flex-shrink:0;${border}" onerror="this.style.display='none';">`;
  }
  const initials = (name||'?').slice(0,2).toUpperCase();
  const bg = backgroundCss || 'linear-gradient(135deg,var(--tera-violet),var(--tera-cyan))';
  return `<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size*0.28)}px;flex-shrink:0;background:${bg};display:flex;align-items:center;justify-content:center;font-family:'Chakra Petch',sans-serif;font-size:${Math.round(size*0.4)}px;font-weight:700;color:#0a0c14;${border}">${initials}</div>`;
}

// ---------- Troféus do último torneio concluído (Ouro/Prata/Bronze) ----------
// Recalculado sempre a partir do torneio concluído mais recente — os troféus
// "trocam de dono" sozinhos assim que outro torneio terminar.
// Devolve { tournamentName, tier, gold, silver, bronze:[...] } ou null se não
// houver nenhum torneio concluído ainda.
function computeCurrentTrophies(rows){
  const concluded = rows
    .filter(r => r.data && r.data.champion)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  if(!concluded.length) return null;

  const r = concluded[0];
  const data = r.data;
  const matches = data.matches || [];
  const finalMatch = matches.find(m => m.next === null);
  if(!finalMatch) return { tournamentName: data.name, tier: data.tier, gold: data.champion, silver: null, bronze: [] };

  const silver = finalMatch.winner === finalMatch.p1 ? finalMatch.p2 : finalMatch.p1;
  const bronze = matches
    .filter(m => m.next === finalMatch.id && m.winner)
    .map(m => m.winner === m.p1 ? m.p2 : m.p1);

  return { tournamentName: data.name, tier: data.tier, gold: data.champion, silver, bronze };
}

// Devolve o emoji de troféu para um jogador dado o objeto de computeCurrentTrophies(), ou '' se não tiver nenhum.
function trophyEmojiFor(name, trophies){
  if(!trophies || !name) return '';
  if(trophies.gold === name) return '🥇';
  if(trophies.silver === name) return '🥈';
  if(trophies.bronze && trophies.bronze.includes(name)) return '🥉';
  return '';
}

// ---------- Confrontos diretos e sequências ----------
// Devolve { opponents:{nome:{wins,losses}}, nemesis, favoriteVictim, mostFrequent,
// currentStreak:{type,count}, bestTier:{tier,winrate,wins,losses} } para um jogador.
function computeHeadToHead(rows, playerName){
  const opponents = {};
  const matchSequence = [];
  const tierRecord = {};

  const sorted = rows.slice().sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
  sorted.forEach(r=>{
    const data = r.data || {};
    const tier = data.tier || r.tier || '?';
    const matches = data.matches || [];
    matches.forEach(m=>{
      if(!m.winner || !m.p1 || !m.p2) return;
      if(m.p1 !== playerName && m.p2 !== playerName) return;
      const opponent = m.p1 === playerName ? m.p2 : m.p1;
      const won = m.winner === playerName;
      if(!opponents[opponent]) opponents[opponent] = {wins:0, losses:0};
      if(won) opponents[opponent].wins++; else opponents[opponent].losses++;
      if(!tierRecord[tier]) tierRecord[tier] = {wins:0, losses:0};
      if(won) tierRecord[tier].wins++; else tierRecord[tier].losses++;
      matchSequence.push({ result: won ? 'win' : 'loss' });
    });
  });

  let nemesis = null;
  Object.entries(opponents).forEach(([opp, rec])=>{
    if(rec.losses > 0 && (!nemesis || rec.losses > nemesis.losses)) nemesis = {name:opp, losses:rec.losses, wins:rec.wins};
  });

  let favoriteVictim = null;
  Object.entries(opponents).forEach(([opp, rec])=>{
    if(rec.wins > 0 && (!favoriteVictim || rec.wins > favoriteVictim.wins)) favoriteVictim = {name:opp, wins:rec.wins, losses:rec.losses};
  });

  let mostFrequent = null;
  Object.entries(opponents).forEach(([opp, rec])=>{
    const total = rec.wins + rec.losses;
    if(!mostFrequent || total > mostFrequent.total) mostFrequent = {name:opp, total, wins:rec.wins, losses:rec.losses};
  });

  let currentStreak = null;
  if(matchSequence.length){
    const last = matchSequence[matchSequence.length-1];
    let count = 0;
    for(let i=matchSequence.length-1;i>=0;i--){
      if(matchSequence[i].result === last.result) count++;
      else break;
    }
    currentStreak = { type: last.result, count };
  }

  let bestTier = null;
  Object.entries(tierRecord).forEach(([tier, rec])=>{
    const total = rec.wins + rec.losses;
    if(total < 2) return;
    const winrate = rec.wins / total;
    if(!bestTier || winrate > bestTier.winrate) bestTier = {tier, winrate, wins:rec.wins, losses:rec.losses};
  });

  return { opponents, nemesis, favoriteVictim, mostFrequent, currentStreak, bestTier };
}

// ---------- Mini-perfil (hover) ----------
// Devolve o HTML de dentro do mini-cartão que aparece ao passar o rato sobre
// o nome/avatar de um jogador. Usado por viewer.html e estatisticas.html.
function buildHoverCardHtml(name, playerStats, playerProfiles, currentTrophies, eloRatings){
  const st = (playerStats && playerStats[name]) || null;
  const profile = (playerProfiles && playerProfiles[name]) || {};
  const displayName = profile.nickname ? profile.nickname : name;
  const avatar = avatarHtml(name, profile.photo_url, 40);
  const trophy = trophyEmojiFor(name, currentTrophies);
  const elo = eloRatings ? (eloRatings[name] || 1000) : null;

  let statsLine = 'Ainda sem torneios registrados.';
  if(st){
    const total = st.wins + st.losses;
    const wr = total ? Math.round((st.wins/total)*100) : 0;
    statsLine = `${st.wins}V - ${st.losses}D (${wr}%) · ${st.titles} título(s)`;
  }

  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      ${avatar}
      <div>
        <div style="font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:14px;color:var(--text-main);">${trophy} ${escapeHtml(displayName)}</div>
        ${profile.nickname ? `<div style="font-size:10.5px;color:var(--text-faint);">${escapeHtml(name)}</div>` : ''}
      </div>
    </div>
    ${elo!==null ? `<div style="font-size:11.5px;color:var(--tera-amber);margin-bottom:4px;">Elo: ${elo}</div>` : ''}
    <div style="font-size:12px;color:var(--text-dim);">${statsLine}</div>
    ${profile.status_message ? `<div style="font-size:11.5px;color:var(--text-dim);font-style:italic;margin-top:6px;">"${escapeHtml(profile.status_message)}"</div>` : ''}
  `;
}

// ---------- Tema claro/escuro ----------
// Compartilhado por todas as páginas hospedadas. A preferência fica guardada
// no browser (localStorage), por isso persiste entre visitas e entre páginas
// do mesmo site.
function updateThemeIcon(){
  const btn = document.getElementById('themeToggleBtn');
  if(btn) btn.textContent = document.body.classList.contains('light-theme') ? '☀️' : '🌙';
}
function initTheme(){
  if(localStorage.getItem('site_theme') === 'light'){
    document.body.classList.add('light-theme');
  }
  updateThemeIcon();
}
function toggleTheme(){
  document.body.classList.toggle('light-theme');
  localStorage.setItem('site_theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
  updateThemeIcon();
}

// ---------- Elo (classificação de força) ----------
// Calcula a classificação Elo de cada jogador a partir de todo o histórico de
// partidas, em ordem cronológica. Base = 1000, K-factor = 32 (valor padrão
// usado em muitos sistemas de xadrez/jogos competitivos).
// Devolve um mapa { nome: pontuação (arredondada) }.
function computeEloRatings(rows){
  const ratings = {};
  const K = 32;
  const BASE = 1000;

  function getRating(name){
    if(!(name in ratings)) ratings[name] = BASE;
    return ratings[name];
  }

  const sorted = rows.slice().sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  sorted.forEach(r=>{
    const data = r.data || {};
    const matches = data.matches || [];
    matches.forEach(m=>{
      if(!m.winner || !m.p1 || !m.p2) return;
      const winner = m.winner;
      const loser = winner === m.p1 ? m.p2 : m.p1;
      const rWinner = getRating(winner);
      const rLoser = getRating(loser);
      const expectedWinner = 1 / (1 + Math.pow(10, (rLoser - rWinner) / 400));
      ratings[winner] = rWinner + K * (1 - expectedWinner);
      ratings[loser] = rLoser + K * (0 - (1 - expectedWinner));
    });
  });

  const rounded = {};
  Object.entries(ratings).forEach(([name, r]) => { rounded[name] = Math.round(r); });
  return rounded;
}

// Devolve o histórico cronológico do Elo de UM jogador — um ponto a cada
// partida dele já disputada. Útil para desenhar um gráfico de evolução.
function computeEloHistory(rows, playerName){
  const ratings = {};
  const K = 32;
  const BASE = 1000;
  function getRating(name){
    if(!(name in ratings)) ratings[name] = BASE;
    return ratings[name];
  }

  const history = [];
  const sorted = rows.slice().sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  sorted.forEach(r=>{
    const data = r.data || {};
    const matches = data.matches || [];
    matches.forEach(m=>{
      if(!m.winner || !m.p1 || !m.p2) return;
      const winner = m.winner;
      const loser = winner === m.p1 ? m.p2 : m.p1;
      const rWinner = getRating(winner);
      const rLoser = getRating(loser);
      const expectedWinner = 1 / (1 + Math.pow(10, (rLoser - rWinner) / 400));
      ratings[winner] = rWinner + K * (1 - expectedWinner);
      ratings[loser] = rLoser + K * (0 - (1 - expectedWinner));
      if(winner === playerName || loser === playerName){
        history.push({ date: r.created_at, rating: Math.round(ratings[playerName]) });
      }
    });
  });
  return history;
}

// Desenha um gráfico de linha simples (SVG, sem bibliotecas externas) a
// partir do histórico devolvido por computeEloHistory().
function buildEloChartSvg(history){
  if(!history || history.length < 2){
    return '<div style="font-size:12.5px;color:var(--text-faint);text-align:center;padding:16px 0;">Ainda não há partidas suficientes para desenhar o gráfico.</div>';
  }
  const W = 600, H = 160, PAD = 28;
  const ratingsArr = history.map(h=>h.rating);
  const minR = Math.min(...ratingsArr) - 15;
  const maxR = Math.max(...ratingsArr) + 15;
  const range = (maxR - minR) || 1;

  const points = history.map((h,i)=>{
    const x = PAD + (i/(history.length-1)) * (W - PAD*2);
    const y = H - PAD - ((h.rating - minR)/range) * (H - PAD*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length-1].split(',');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
    <polyline points="${points.join(' ')}" fill="none" stroke="var(--tera-cyan)" stroke-width="2.5"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="var(--tera-amber)"/>
    <text x="${PAD}" y="16" font-size="11" fill="var(--text-faint)">${Math.round(maxR)}</text>
    <text x="${PAD}" y="${H-8}" font-size="11" fill="var(--text-faint)">${Math.round(minR)}</text>
  </svg>`;
}

// ---------- Moedas: presentear outro jogador ----------
async function logGift(supabaseUrl, supabaseAnonKey, fromName, toName, amount){
  try{
    await fetch(`${supabaseUrl}/rest/v1/gifts`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify([{ from_name: fromName, to_name: toName, amount }])
    });
  } catch(e){ /* silencioso — a doação em si já foi feita, só o registo do ranking falhou */ }
}

// Devolve {ok, reason} — 'invalid' | 'insufficient' | 'error' | true
async function giftCoins(supabaseUrl, supabaseAnonKey, fromName, toName, amount){
  if(!amount || amount <= 0) return {ok:false, reason:'invalid'};
  if(fromName === toName) return {ok:false, reason:'invalid'};

  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(fromName)}&select=coins`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  if((rows[0].coins||0) < amount) return {ok:false, reason:'insufficient'};

  const fromOk = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, fromName, -amount, `Presente enviado para ${toName}`);
  if(!fromOk) return {ok:false, reason:'error'};
  const toOk = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, toName, amount, `Presente recebido de ${fromName}`);
  if(!toOk){
    await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, fromName, amount, 'Estorno de presente (falhou)'); // devolve se o segundo passo falhar
    return {ok:false, reason:'error'};
  }
  await logGift(supabaseUrl, supabaseAnonKey, fromName, toName, amount);
  return {ok:true};
}

async function fetchGenerosityRanking(supabaseUrl, supabaseAnonKey){
  const res = await fetch(`${supabaseUrl}/rest/v1/gifts?select=from_name,amount`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return [];
  const rows = await res.json();
  const totals = {};
  rows.forEach(r=>{ totals[r.from_name] = (totals[r.from_name]||0) + r.amount; });
  return Object.entries(totals).sort((a,b)=>b[1]-a[1]);
}

// ---------- Moedas: ajuste genérico (usado pelo Palpiteiro e pelas doações) ----------
// amount pode ser negativo (para descontar, ex: ao apostar ou ao presentear).
// ---------- Histórico de transações de moedas ----------
async function logCoinTransaction(supabaseUrl, supabaseAnonKey, name, amount, reason){
  if(!reason) return;
  try{
    await fetch(`${supabaseUrl}/rest/v1/coin_transactions`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify([{ player_name: name, amount, reason }])
    });
  } catch(e){ /* silencioso — a transação em si já foi feita, só o registo do histórico falhou */ }
}

async function fetchCoinTransactions(supabaseUrl, supabaseAnonKey, name, limit){
  const res = await fetch(`${supabaseUrl}/rest/v1/coin_transactions?player_name=eq.${encodeURIComponent(name)}&select=*&order=created_at.desc&limit=${limit||30}`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return [];
  return await res.json();
}

// amount pode ser negativo (para descontar, ex: ao apostar ou ao presentear).
// reason (opcional) fica registado no histórico de transações do jogador.
async function adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, amount, reason){
  if(!name || !amount) return false;
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    if(!rows || !rows[0]) return false;
    const newCoins = Math.max(0, (rows[0].coins || 0) + amount);
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({ coins: newCoins })
    });
    if(patchRes.ok && reason){
      await logCoinTransaction(supabaseUrl, supabaseAnonKey, name, amount, reason);
    }
    return patchRes.ok;
  } catch(e){
    return false;
  }
}

// ---------- Bloco 3 (compra): Patrocínio e Garantia de bye ----------
const SPONSORSHIP_PRICE = 200;
const GUARANTEED_BYE_PRICE = 150;

// ---------- Desbloqueio do gráfico de evolução do Elo ----------
const ELO_CHART_PRICE = 80;

// Devolve {ok, reason} — 'insufficient' | 'alreadyunlocked' | 'error' | true
async function buyEloChartUnlock(supabaseUrl, supabaseAnonKey, name){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins,elo_chart_unlocked`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  if(rows[0].elo_chart_unlocked) return {ok:false, reason:'alreadyunlocked'};
  if((rows[0].coins||0) < ELO_CHART_PRICE) return {ok:false, reason:'insufficient'};

  const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, -ELO_CHART_PRICE, 'Desbloqueio do gráfico de evolução do Elo');
  if(!ok) return {ok:false, reason:'error'};
  await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ elo_chart_unlocked: true })
  });
  return {ok:true};
}

// ---------- Bloco 3 (ajuste): preço do reroll dobra a cada pedido feito pelo
// mesmo jogador NO MESMO torneio (30 -> 60 -> 120 -> ...), voltando ao normal
// no torneio seguinte porque a contagem é sempre por torneio.
const REROLL_BASE_COST = 30;
function computeRerollPrice(priorRequestsThisTournament){
  return REROLL_BASE_COST * Math.pow(2, priorRequestsThisTournament || 0);
}
async function countMyRerollRequests(supabaseUrl, supabaseAnonKey, tournamentId, playerName){
  const res = await fetch(`${supabaseUrl}/rest/v1/reroll_requests?tournament_id=eq.${tournamentId}&player_name=eq.${encodeURIComponent(playerName)}&status=neq.rejected&select=id`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return 0;
  const rows = await res.json();
  return rows.length;
}

// Devolve {ok, reason} — 'insufficient' | 'error' | true
async function buySponsorship(supabaseUrl, supabaseAnonKey, name, message){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  if((rows[0].coins||0) < SPONSORSHIP_PRICE) return {ok:false, reason:'insufficient'};

  const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, -SPONSORSHIP_PRICE, 'Patrocínio do torneio da semana');
  if(!ok) return {ok:false, reason:'error'};
  await fetch(`${supabaseUrl}/rest/v1/sponsorships`, {
    method:'POST',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify([{ sponsor_name: name, amount: SPONSORSHIP_PRICE, used:false, message: message || null }])
  });
  return {ok:true};
}

// Devolve {ok, reason} — 'insufficient' | 'alreadyactive' | 'error' | true
async function buyGuaranteedBye(supabaseUrl, supabaseAnonKey, name){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins,guaranteed_bye`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  if(rows[0].guaranteed_bye) return {ok:false, reason:'alreadyactive'};
  if((rows[0].coins||0) < GUARANTEED_BYE_PRICE) return {ok:false, reason:'insufficient'};

  const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, -GUARANTEED_BYE_PRICE, 'Garantia de bye no Play-in');
  if(!ok) return {ok:false, reason:'error'};
  await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ guaranteed_bye: true })
  });
  return {ok:true};
}

// ---------- Bloco 4: Voto no tier da próxima semana ----------
const ALL_TIERS = ['OU','UU','RU','NU','PU','ZU'];

// Devolve a lista de tiers ainda por jogar no ciclo atual (reinicia quando
// todos os 6 já saíram uma vez desde o último reinício).
function computeRemainingTiersInCycle(rows){
  const sorted = rows.slice().sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  let usedInCycle = new Set();
  sorted.forEach(r=>{
    const tier = r.tier;
    if(!tier) return;
    if(usedInCycle.size >= ALL_TIERS.length) usedInCycle = new Set();
    usedInCycle.add(tier);
  });
  const remaining = ALL_TIERS.filter(t => !usedInCycle.has(t));
  // Se o ciclo acabou de se completar totalmente, o próximo torneio já
  // começa um ciclo novo — mostra os 6 tiers outra vez em vez de lista vazia.
  return remaining.length ? remaining : ALL_TIERS;
}

// Devolve {ok, reason} — 'insufficient' | 'invalid' | 'error' | true
async function castTierVote(supabaseUrl, supabaseAnonKey, name, tier, amount){
  if(!amount || amount <= 0) return {ok:false, reason:'invalid'};
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  if((rows[0].coins||0) < amount) return {ok:false, reason:'insufficient'};

  const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, -amount, `Voto no tier ${tier} para a próxima semana`);
  if(!ok) return {ok:false, reason:'error'};
  await fetch(`${supabaseUrl}/rest/v1/tier_votes`, {
    method:'POST',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify([{ voter_name: name, tier, amount }])
  });
  return {ok:true};
}

async function fetchTierVoteStandings(supabaseUrl, supabaseAnonKey){
  const res = await fetch(`${supabaseUrl}/rest/v1/tier_votes?select=tier,amount`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return [];
  const rows = await res.json();
  const totals = {};
  rows.forEach(r=>{ totals[r.tier] = (totals[r.tier]||0) + r.amount; });
  return Object.entries(totals).sort((a,b)=>b[1]-a[1]);
}

// ---------- Bloco 4: Caixa surpresa (loot box) ----------
// Totalmente aleatória — o jogador não escolhe nem a categoria nem o item,
// sai à sorte de tudo (fundo, cor, moldura, efeito, título ou emblema).
const LOOT_BOX_PRICE = 35;
const LOOT_BOX_CATEGORIES = ['backgrounds','accents','frames','nameEffects','titles','badges'];

// Devolve {ok, reason, item, category} — 'insufficient' | 'nooptions' | 'error' | true
async function openLootBox(supabaseUrl, supabaseAnonKey, name){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins,owned_cosmetics`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  const current = rows[0];
  if((current.coins||0) < LOOT_BOX_PRICE) return {ok:false, reason:'insufficient'};

  const owned = current.owned_cosmetics || [];
  // Junta TODOS os itens de TODAS as categorias num único conjunto, e sorteia
  // um item qualquer entre os que o jogador ainda não tem — sem preferência
  // de categoria, cada item individual tem a mesma chance.
  const allAvailable = [];
  LOOT_BOX_CATEGORIES.forEach(cat=>{
    (COSMETIC_CATALOG[cat]||[]).forEach(item=>{
      if(item.price > 0 && !owned.includes(item.id)) allAvailable.push({ item, category: cat });
    });
  });
  if(!allAvailable.length) return {ok:false, reason:'nooptions'};

  const { item: won, category } = allAvailable[Math.floor(Math.random()*allAvailable.length)];
  const newCoins = (current.coins||0) - LOOT_BOX_PRICE;
  const newOwned = owned.concat([won.id]);
  const patchRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ coins: newCoins, owned_cosmetics: newOwned })
  });
  if(patchRes.ok){
    await logCoinTransaction(supabaseUrl, supabaseAnonKey, name, -LOOT_BOX_PRICE, `Caixa surpresa: ganhou ${won.name}`);
  }
  return {ok: patchRes.ok, item: won, category};
}

// ---------- Bloco 4: Roleta simples ----------
// Multiplicadores com pesos diferentes — a soma das probabilidades dá 100%.
const ROULETTE_OUTCOMES = [
  { multiplier: 0,   weight: 35, label: '💀 Perdeu tudo' },
  { multiplier: 0.5, weight: 25, label: '📉 Metade de volta' },
  { multiplier: 1,   weight: 20, label: '➖ Empate' },
  { multiplier: 2,   weight: 12, label: '📈 Dobrou!' },
  { multiplier: 3,   weight: 6,  label: '🎉 Triplicou!' },
  { multiplier: 5,   weight: 2,  label: '💎 Jackpot 5x!' }
];

function pickRouletteOutcome(){
  const totalWeight = ROULETTE_OUTCOMES.reduce((s,o)=>s+o.weight, 0);
  let roll = Math.random() * totalWeight;
  for(const outcome of ROULETTE_OUTCOMES){
    if(roll < outcome.weight) return outcome;
    roll -= outcome.weight;
  }
  return ROULETTE_OUTCOMES[0];
}

// Devolve {ok, reason, outcome, payout} — 'insufficient' | 'invalid' | 'error' | true
async function spinRoulette(supabaseUrl, supabaseAnonKey, name, betAmount){
  if(!betAmount || betAmount <= 0) return {ok:false, reason:'invalid'};
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  if((rows[0].coins||0) < betAmount) return {ok:false, reason:'insufficient'};

  const outcome = pickRouletteOutcome();
  const payout = Math.round(betAmount * outcome.multiplier);
  const net = payout - betAmount; // pode ser negativo

  const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, net, `Roleta: ${outcome.label}`);
  if(!ok) return {ok:false, reason:'error'};
  return {ok:true, outcome, payout};
}

// ---------- Ícone do jogador logado (canto da tela, leva ao perfil) ----------
// Devolve o HTML de uma "pill" pequena com o avatar do jogador; ao clicar,
// navega para perfil.html. Usa o mesmo avatarHtml (fundo/moldura equipados).
// Se ninguém estiver logado ainda (name vazio), mostra um estado genérico
// "Entrar" que também leva ao perfil (onde aparece o ecrã de login).
function renderPlayerCornerBadge(name, profile){
  if(!name){
    return `<a href="perfil.html" class="player-corner-badge" title="Entrar">
      <span style="width:28px;height:28px;border-radius:8px;background:var(--bg-card);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">👤</span>
      <span class="player-corner-name">Entrar</span>
    </a>`;
  }
  profile = profile || {};
  const displayName = profile.nickname || name;
  const bgCosmetic = profile.equippedBackground ? getCosmeticById(profile.equippedBackground) : null;
  const frameCosmetic = profile.equippedFrame ? getCosmeticById(profile.equippedFrame) : null;
  const avatar = avatarHtml(name, profile.photo_url, 28, bgCosmetic ? bgCosmetic.css : null, frameCosmetic ? frameCosmetic.border : null);
  return `<a href="perfil.html" class="player-corner-badge" title="Ver o meu perfil">
    ${avatar}
    <span class="player-corner-name">${escapeHtml(displayName)}</span>
  </a>`;
}

// ---------- Roleta: histórico e ranking ----------
// Reaproveita o histórico de transações já existente (cada giro fica lá
// registado como "Roleta: <resultado>"), sem precisar de tabela nova.
async function fetchRouletteTransactions(supabaseUrl, supabaseAnonKey, name, limit){
  let url = `${supabaseUrl}/rest/v1/coin_transactions?reason=like.Roleta:*&select=*&order=created_at.desc`;
  if(name) url += `&player_name=eq.${encodeURIComponent(name)}`;
  if(limit) url += `&limit=${limit}`;
  const res = await fetch(url, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return [];
  return await res.json();
}

const ROULETTE_RANKING_MIN_SPINS = 3;

async function fetchRouletteRanking(supabaseUrl, supabaseAnonKey){
  const rows = await fetchRouletteTransactions(supabaseUrl, supabaseAnonKey, null, null);
  const stats = {};
  rows.forEach(r=>{
    if(!stats[r.player_name]) stats[r.player_name] = { spins:0, netProfit:0, biggestWin:0 };
    stats[r.player_name].spins++;
    stats[r.player_name].netProfit += r.amount;
    if(r.amount > stats[r.player_name].biggestWin) stats[r.player_name].biggestWin = r.amount;
  });
  return Object.entries(stats)
    .filter(([,s])=>s.spins >= ROULETTE_RANKING_MIN_SPINS)
    .sort((a,b)=>b[1].netProfit-a[1].netProfit);
}

// ---------- Registo de auditoria (ações do organizador e dos jogadores) ----------
async function logActivity(supabaseUrl, supabaseAnonKey, actorType, actorName, category, action){
  try{
    await fetch(`${supabaseUrl}/rest/v1/activity_log`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify([{ actor_type: actorType, actor_name: actorName || null, category, action }])
    });
  } catch(e){ /* silencioso — a ação em si já foi feita, só o registo falhou */ }
}

// filters: {actorType, category, actorName, limit}
async function fetchActivityLog(supabaseUrl, supabaseAnonKey, filters){
  filters = filters || {};
  let url = `${supabaseUrl}/rest/v1/activity_log?select=*&order=created_at.desc`;
  if(filters.actorType) url += `&actor_type=eq.${encodeURIComponent(filters.actorType)}`;
  if(filters.category) url += `&category=eq.${encodeURIComponent(filters.category)}`;
  if(filters.actorName) url += `&actor_name=eq.${encodeURIComponent(filters.actorName)}`;
  url += `&limit=${filters.limit || 100}`;
  const res = await fetch(url, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return [];
  return await res.json();
}

// ---------- Sequência atual de TODOS os jogadores, calculada de uma vez só ----------
// Devolve { nome: {type:'win'|'loss', count} }.
function computeAllCurrentStreaks(rows){
  const sequences = {};
  const sorted = rows.slice().sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
  sorted.forEach(r=>{
    const matches = (r.data||{}).matches || [];
    matches.forEach(m=>{
      if(!m.winner || !m.p1 || !m.p2) return;
      const loser = m.winner === m.p1 ? m.p2 : m.p1;
      if(!sequences[m.winner]) sequences[m.winner] = [];
      if(!sequences[loser]) sequences[loser] = [];
      sequences[m.winner].push('win');
      sequences[loser].push('loss');
    });
  });
  const streaks = {};
  Object.entries(sequences).forEach(([name, seq])=>{
    if(!seq.length) return;
    const last = seq[seq.length-1];
    let count = 0;
    for(let i=seq.length-1;i>=0;i--){
      if(seq[i] === last) count++;
      else break;
    }
    streaks[name] = { type: last, count };
  });
  return streaks;
}

// ---------- Conquistas automáticas (diferentes dos emblemas da loja — estas
// não custam moedas, desbloqueiam-se sozinhas por mérito) ----------
const ACHIEVEMENTS = [
  { id:'first_win',           name:'Primeira Vitória',    emoji:'🥇', desc:'Venceu a primeira partida' },
  { id:'ten_wins',             name:'Veterano de Guerra',  emoji:'⚔️', desc:'10 vitórias no total' },
  { id:'five_tournaments',     name:'Assíduo',             emoji:'🎮', desc:'Jogou 5 torneios' },
  { id:'win_streak_3',         name:'Em Chamas',           emoji:'🔥', desc:'3 vitórias seguidas' },
  { id:'win_streak_5',         name:'Imparável',           emoji:'⚡', desc:'5 vitórias seguidas' },
  { id:'first_title',          name:'Campeão',             emoji:'🏆', desc:'Venceu o primeiro torneio' },
  { id:'three_titles',         name:'Dinastia',            emoji:'💎', desc:'3 títulos conquistados' },
  { id:'multi_tier_champion',  name:'Poliglota',           emoji:'👑', desc:'Campeão em 2 tiers diferentes' }
];

// stats vem de aggregatePlayers()[nome]; streak vem de computeAllCurrentStreaks()[nome].
// Devolve um Set com os ids das conquistas já desbloqueadas.
function computeAchievements(stats, streak){
  const earned = new Set();
  if(!stats) return earned;
  if(stats.wins >= 1) earned.add('first_win');
  if(stats.wins >= 10) earned.add('ten_wins');
  if(stats.tournaments.length >= 5) earned.add('five_tournaments');
  if(streak && streak.type === 'win' && streak.count >= 3) earned.add('win_streak_3');
  if(streak && streak.type === 'win' && streak.count >= 5) earned.add('win_streak_5');
  if(stats.titles >= 1) earned.add('first_title');
  if(stats.titles >= 3) earned.add('three_titles');
  if(Object.keys(stats.titlesByTier || {}).length >= 2) earned.add('multi_tier_champion');
  return earned;
}

// ---------- Aposta no Campeão da Semana (aposta única, antes do torneio começar) ----------
function computeChampionBetMultiplier(playerCount){
  return Math.max(3, Math.round(playerCount / 2));
}

// Devolve {ok, reason} — 'insufficient' | 'invalid' | 'error' | true
async function placeChampionBet(supabaseUrl, supabaseAnonKey, tournamentId, name, predictedChampion, wager, multiplier){
  if(!wager || wager <= 0) return {ok:false, reason:'invalid'};
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  if((rows[0].coins||0) < wager) return {ok:false, reason:'insufficient'};

  const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, -wager, `Apostou no campeão da semana: ${predictedChampion}`);
  if(!ok) return {ok:false, reason:'error'};

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/champion_bets`, {
    method:'POST',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify([{ tournament_id: tournamentId, predictor_name: name, predicted_champion: predictedChampion, wager, multiplier }])
  });
  if(!insertRes.ok){
    await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, wager, 'Estorno de aposta no campeão (falhou)');
    return {ok:false, reason:'error'};
  }
  return {ok:true};
}

async function fetchMyChampionBet(supabaseUrl, supabaseAnonKey, tournamentId, name){
  const res = await fetch(`${supabaseUrl}/rest/v1/champion_bets?tournament_id=eq.${tournamentId}&predictor_name=eq.${encodeURIComponent(name)}&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return null;
  const rows = await res.json();
  return (rows && rows[0]) ? rows[0] : null;
}

// Resolve apostas de campeão pendentes — chamado sempre que a página carrega,
// tal como já fazemos com os palpites por partida.
async function resolvePendingChampionBets(supabaseUrl, supabaseAnonKey, allRows){
  const res = await fetch(`${supabaseUrl}/rest/v1/champion_bets?resolved=eq.false&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return;
  const pending = await res.json();
  if(!pending.length) return;

  const tournamentsById = {};
  allRows.forEach(r=>{ tournamentsById[r.id] = r.data || {}; });

  for(const bet of pending){
    const data = tournamentsById[bet.tournament_id];
    if(!data || !data.champion) continue; // torneio ainda não tem campeão definido, deixa pendente

    const correct = data.champion === bet.predicted_champion;
    if(correct){
      const payout = Math.round(bet.wager * bet.multiplier);
      await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, bet.predictor_name, payout, `Acertou o campeão da semana: ${bet.predicted_champion} (${bet.multiplier}x)`);
    }
    await fetch(`${supabaseUrl}/rest/v1/champion_bets?id=eq.${bet.id}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({ resolved:true, correct })
    });
  }
}

async function fetchChampionBetHistory(supabaseUrl, supabaseAnonKey, name, limit){
  const res = await fetch(`${supabaseUrl}/rest/v1/champion_bets?predictor_name=eq.${encodeURIComponent(name)}&select=*&order=created_at.desc&limit=${limit||20}`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return [];
  return await res.json();
}

// ---------- Toast: notificação flutuante pequena, reaproveitada pelo bônus diário e pelas conquistas ----------
function ensureToastStyles(){
  if(document.getElementById('vseToastStyles')) return;
  const style = document.createElement('style');
  style.id = 'vseToastStyles';
  style.textContent = `
    @keyframes vseToastIn{from{opacity:0;transform:translateY(-12px) scale(0.95);}to{opacity:1;transform:translateY(0) scale(1);}}
    #vseToastContainer{position:fixed;top:66px;left:50%;transform:translateX(-50%);z-index:2000;
      display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}
    .vse-toast{background:linear-gradient(135deg,#4fd8d0,#a56bf0);color:#0a0c14;padding:13px 20px;border-radius:12px;
      font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:13.5px;box-shadow:0 8px 24px rgba(0,0,0,0.35);
      animation:vseToastIn .3s ease-out;text-align:center;max-width:320px;}
  `;
  document.head.appendChild(style);
}

function showCelebrationToast(html, durationMs){
  ensureToastStyles();
  let container = document.getElementById('vseToastContainer');
  if(!container){
    container = document.createElement('div');
    container.id = 'vseToastContainer';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'vse-toast';
  toast.innerHTML = html;
  container.appendChild(toast);
  setTimeout(()=>{
    toast.style.transition = 'opacity .4s, transform .4s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(()=> toast.remove(), 400);
  }, durationMs || 5000);
}

// ---------- Bônus diário de login ----------
const DAILY_BONUS_AMOUNT = 5;

// Devolve {awarded, amount} — awarded=true só na primeira visita de cada dia.
async function claimDailyBonus(supabaseUrl, supabaseAnonKey, name){
  if(!name) return {awarded:false};
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=last_daily_bonus`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    if(!rows || !rows[0]) return {awarded:false};
    const today = new Date().toISOString().slice(0,10);
    if(rows[0].last_daily_bonus === today) return {awarded:false};

    const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, DAILY_BONUS_AMOUNT, 'Bônus diário de login');
    if(!ok) return {awarded:false};
    await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({ last_daily_bonus: today })
    });
    return {awarded:true, amount: DAILY_BONUS_AMOUNT};
  } catch(e){
    return {awarded:false};
  }
}

// ---------- Celebração ao desbloquear conquista nova ----------
// Compara as conquistas já ganhas (earnedSet) com as já mostradas antes, devolve
// só as NOVAS, e regista-as como já vistas para não repetir a celebração.
async function checkNewAchievements(supabaseUrl, supabaseAnonKey, name, earnedSet){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=seen_achievements`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    if(!rows || !rows[0]) return [];
    const seen = new Set(rows[0].seen_achievements || []);
    const newOnes = [...earnedSet].filter(id => !seen.has(id));
    if(newOnes.length){
      const updatedSeen = Array.from(new Set([...seen, ...newOnes]));
      await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
        method:'PATCH',
        headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
        body: JSON.stringify({ seen_achievements: updatedSeen })
      });
    }
    return newOnes;
  } catch(e){
    return [];
  }
}

// ---------- Cartão exportável de confronto direto entre dois jogadores ----------
function generateHeadToHeadCardCanvas(nameA, nameB, winsA, winsB){
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 400;
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createLinearGradient(0,0,800,400);
  bgGrad.addColorStop(0, '#0a0c14');
  bgGrad.addColorStop(1, '#171b28');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0,0,800,400);

  const barGrad = ctx.createLinearGradient(0,0,800,0);
  barGrad.addColorStop(0, '#4fd8d0');
  barGrad.addColorStop(1, '#a56bf0');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0,0,800,8);

  ctx.textAlign = 'center';
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#8b91a8';
  ctx.fillText('CONFRONTO DIRETO', 400, 60);

  ctx.font = 'bold 38px sans-serif';
  ctx.fillStyle = '#e9ecf5';
  ctx.fillText(nameA, 220, 150);
  ctx.fillText(nameB, 580, 150);

  ctx.font = '24px sans-serif';
  ctx.fillStyle = '#565d78';
  ctx.fillText('vs', 400, 150);

  ctx.font = 'bold 64px sans-serif';
  ctx.fillStyle = winsA >= winsB ? '#f0b64f' : '#e9ecf5';
  ctx.fillText(String(winsA), 220, 250);
  ctx.fillStyle = winsB >= winsA ? '#f0b64f' : '#e9ecf5';
  ctx.fillText(String(winsB), 580, 250);

  const total = winsA + winsB;
  const barW = 500, barX = 150, barY = 300, barH = 18;
  ctx.fillStyle = '#262c3e';
  ctx.fillRect(barX, barY, barW, barH);
  if(total > 0){
    const aWidth = (winsA/total) * barW;
    ctx.fillStyle = '#4fd8d0';
    ctx.fillRect(barX, barY, aWidth, barH);
    ctx.fillStyle = '#a56bf0';
    ctx.fillRect(barX+aWidth, barY, barW-aWidth, barH);
  }

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#565d78';
  ctx.fillText('Torneio Showdown - VSE', 400, 375);

  return canvas;
}

function downloadCanvasAsPng(canvas, filename){
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
