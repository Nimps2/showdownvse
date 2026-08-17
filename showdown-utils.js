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
  const result = { name:null, nickname:null, item:null, ability:null, nature:null, evs:{}, ivs:{}, teraType:null, moves:[] };

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
    result.nickname = nickMatch[1].trim();
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
  const res = await fetch(`${supabaseUrl}/rest/v1/players?select=name,nickname,photo_url,status_message,coins,owned_cosmetics,equipped_background,equipped_accent,equipped_frame,equipped_name_effect,equipped_title,equipped_badges,profile_background_url,guaranteed_bye,elo_chart_unlocked,featured_achievements,total_daily_claims,special_tags`, {headers: sbAuthHeaders(supabaseAnonKey)});
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
      eloChartUnlocked: !!r.elo_chart_unlocked, featuredAchievements: r.featured_achievements || [],
      totalDailyClaims: r.total_daily_claims || 0, loyaltyDiscountPct: computeLoyaltyDiscountPct(r.total_daily_claims),
      specialTags: r.special_tags || []
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
  // "Fundo do Avatar" já não preenche o círculo — agora é a COR usada pelo
  // efeito animado equipado na Moldura (ver frames abaixo). O campo "css"
  // fica só para a pré-visualização na loja (mostra o gradiente do tema).
  backgrounds: [
    { id:'bg_default',  name:'Padrão',       price:0,   css:'linear-gradient(135deg,#a56bf0,#4fd8d0)', color:'#a56bf0' },
    { id:'bg_sunset',   name:'Pôr do Sol',   price:50,  css:'linear-gradient(135deg,#f0b64f,#e0607a)', color:'#f0b64f' },
    { id:'bg_ocean',    name:'Oceano',       price:50,  css:'linear-gradient(135deg,#0e9488,#4fd8d0)', color:'#4fd8d0' },
    { id:'bg_galaxy',   name:'Galáxia',      price:80,  css:'linear-gradient(135deg,#7c4dc4,#1a1d29)', color:'#7c4dc4' },
    { id:'bg_fire',     name:'Fogo',         price:80,  css:'linear-gradient(135deg,#e0607a,#f0b64f)', color:'#e0607a' },
    { id:'bg_gold',     name:'Ouro Puro',    price:150, css:'linear-gradient(135deg,#f0b64f,#b8860b)', color:'#f0b64f' },
    { id:'bg_aurora',   name:'Aurora Animada', price:220, css:'linear-gradient(270deg,#4fd8d0,#a56bf0,#f0b64f,#4fd8d0)', color:'#a56bf0', multiColor:['#4fd8d0','#a56bf0','#f0b64f'] }
  ],
  accents: [
    { id:'accent_default', name:'Ciano (padrão)', price:0,  color:'#4fd8d0' },
    { id:'accent_violet',  name:'Violeta',        price:30, color:'#a56bf0' },
    { id:'accent_amber',   name:'Âmbar',          price:30, color:'#f0b64f' },
    { id:'accent_rose',    name:'Rosa',           price:30, color:'#e0607a' },
    { id:'accent_emerald', name:'Esmeralda',      price:50, color:'#5ed890' }
  ],
  // "Moldura do Avatar" já não é uma borda estática — agora é um EFEITO
  // ANIMADO à volta do avatar, colorido com a cor escolhida em "Fundo do
  // Avatar" (ver backgrounds acima). Os IDs mantêm-se os mesmos de antes
  // para quem já os tinha comprado não perder nada.
  frames: [
    { id:'frame_none',  name:'Sem moldura',   price:0,   effect:'none' },
    { id:'frame_gold',  name:'Faíscas',       price:60,  effect:'sparks' },
    { id:'frame_neon',  name:'Estrelado',     price:60,  effect:'starry' },
    { id:'frame_royal', name:'Florescer',     price:100, effect:'blossom' },
    { id:'frame_diamond', name:'Moldura de Diamante', price:0, effect:'starry', auctionOnly:true }
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
    { id:'title_underdog',     name:'Zebra do Torneio',    price:40, text:'🦓 Zebra do Torneio' },
    { id:'title_untouchable',  name:'O Intocável',         price:60, text:'🛡️ O Intocável' },
    { id:'title_roulette_king',name:'Rei da Roleta',       price:60, text:'🎰 Rei da Roleta' },
    { id:'title_reroll_master',name:'Mestre das Trocas',   price:60, text:'🔄 Mestre das Trocas' },
    { id:'title_auction_legend', name:'Lenda do Leilão',   price:0, text:'💠 Lenda do Leilão', auctionOnly:true }
  ],
  badges: [
    { id:'badge_stall',   name:'Fã de Stall',   price:30, emoji:'🐌' },
    { id:'badge_speed',   name:'Speedrunner',   price:30, emoji:'⚡' },
    { id:'badge_lucky',   name:'Sortudo',       price:30, emoji:'🍀' },
    { id:'badge_veteran', name:'Veterano',      price:50, emoji:'🎖️' },
    { id:'badge_hazards', name:'Fã de Hazards', price:30, emoji:'🕸️' },
    { id:'badge_allin',   name:'All-in',        price:30, emoji:'🎲' },
    { id:'badge_collector', name:'Colecionador', price:50, emoji:'🗂️' },
    { id:'badge_analyst', name:'Analista',      price:30, emoji:'🔍' }
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
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins,owned_cosmetics,total_daily_claims`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'notfound'};
  const current = rows[0];
  const owned = current.owned_cosmetics || [];
  if(owned.includes(cosmeticId)) return {ok:false, reason:'alreadyowned'};
  const discountPct = computeLoyaltyDiscountPct(current.total_daily_claims);
  const finalPrice = applyLoyaltyDiscount(item.price, discountPct);
  if((current.coins||0) < finalPrice) return {ok:false, reason:'insufficient'};

  const newCoins = (current.coins||0) - finalPrice;
  const newOwned = owned.concat([cosmeticId]);
  const patchRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ coins: newCoins, owned_cosmetics: newOwned })
  });
  if(patchRes.ok && finalPrice > 0){
    const reason = discountPct > 0 ? `Compra na loja: ${item.name} (${discountPct}% de desconto por fidelidade)` : `Compra na loja: ${item.name}`;
    await logCoinTransaction(supabaseUrl, supabaseAnonKey, name, -finalPrice, reason);
  }
  return {ok: patchRes.ok, finalPrice, discountPct};
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
// ---------- Decorações Animadas do Avatar ----------
// A "Moldura" é o tipo de efeito animado à volta do avatar; o "Fundo" deixou
// de preencher o círculo e passou a ser só a COR usada por esse efeito —
// assim as duas personalizações nunca competem visualmente uma com a outra.
function ensureAvatarFxStyles(){
  if(document.getElementById('vseAvatarFxStyles')) return;
  const style = document.createElement('style');
  style.id = 'vseAvatarFxStyles';
  style.textContent = `
    .avatar-fx-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}
    .avatar-fx-layer{position:absolute;inset:0;pointer-events:none;}
    .avatar-fx-layer span{position:absolute;top:50%;left:50%;}

    @keyframes vseSparkFlicker{0%,100%{opacity:0;transform:translate(-50%,-50%) scale(0.4);}50%{opacity:1;transform:translate(-50%,-50%) scale(1.3);}}
    .avatar-fx-sparks span{width:3px;height:3px;border-radius:50%;background:var(--fx-color);
      box-shadow:0 0 4px var(--fx-color);animation:vseSparkFlicker 1.6s ease-in-out infinite;}

    @keyframes vseStarTwinkle{0%,100%{opacity:0.15;transform:translate(-50%,-50%) scale(0.5) rotate(0deg);}50%{opacity:1;transform:translate(-50%,-50%) scale(1.15) rotate(20deg);}}
    .avatar-fx-starry span{width:6px;height:6px;background:var(--fx-color);
      clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);
      animation:vseStarTwinkle 2.2s ease-in-out infinite;filter:drop-shadow(0 0 2px var(--fx-color));}

    @keyframes vseBlossomBloom{0%,100%{opacity:0;transform:translate(-50%,-50%) scale(0) rotate(0deg);}35%{opacity:0.9;transform:translate(-50%,-50%) scale(1) rotate(50deg);}70%{opacity:0.5;transform:translate(-50%,-50%) scale(0.85) rotate(90deg);}}
    .avatar-fx-blossom span{width:7px;height:7px;background:var(--fx-color);
      border-radius:0% 100% 0% 100%;animation:vseBlossomBloom 3s ease-in-out infinite;}

    @keyframes vseFxHueRotate{0%{filter:hue-rotate(0deg);}100%{filter:hue-rotate(360deg);}}
    .avatar-fx-layer.avatar-fx-multicolor{animation:vseFxHueRotate 5s linear infinite;}
  `;
  document.head.appendChild(style);
}

// Pré-visualização em miniatura de um efeito de moldura, usada nos cartões
// da loja/personalização — mostra a animação de verdade, não só um ícone
// estático, para dar uma ideia real do que se está a comprar.
function frameEffectPreviewHtml(effectType){
  if(!effectType || effectType === 'none'){
    return `<div class="shop-swatch" style="background:var(--bg-panel);border:2px dashed var(--line);"></div>`;
  }
  ensureAvatarFxStyles();
  const particles = avatarFxParticlesHtml(effectType, 40);
  return `<div class="shop-swatch avatar-fx-wrap" style="--fx-color:#a56bf0;background:var(--bg-panel);position:relative;">
    <div class="avatar-fx-layer avatar-fx-${effectType}">${particles}</div>
  </div>`;
}

const AVATAR_FX_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const AVATAR_FX_COUNTS = { sparks:6, starry:6, blossom:5 };

function avatarFxParticlesHtml(effectType, radiusPct){
  const count = AVATAR_FX_COUNTS[effectType] || 6;
  return AVATAR_FX_ANGLES.slice(0, count).map((deg, i)=>{
    const rad = deg * Math.PI / 180;
    const x = 50 + radiusPct * Math.cos(rad);
    const y = 50 + radiusPct * Math.sin(rad);
    const delay = (i * (2.4 / count)).toFixed(2);
    return `<span style="top:${y.toFixed(1)}%;left:${x.toFixed(1)}%;animation-delay:${delay}s;"></span>`;
  }).join('');
}

// effectColor: cor (hex) escolhida em "Fundo do Avatar". effectType: 'none' |
// 'sparks' | 'starry' | 'blossom'. multiColor: true para a Aurora Animada,
// faz o efeito ciclar de cor continuamente em vez de ficar fixo.
function avatarHtml(name, photoUrl, sizePx, effectColor, effectType, multiColor){
  const size = sizePx || 44;
  const hasEffect = effectType && effectType !== 'none';
  const contentRadius = Math.round(size*0.28);

  let innerHtml;
  if(photoUrl){
    innerHtml = `<img src="${photoUrl.replace(/"/g,'&quot;')}" alt="${(name||'').replace(/"/g,'&quot;')}" style="width:${size}px;height:${size}px;border-radius:${contentRadius}px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none';">`;
  } else {
    const initials = (name||'?').slice(0,2).toUpperCase();
    innerHtml = `<div style="width:${size}px;height:${size}px;border-radius:${contentRadius}px;flex-shrink:0;background:linear-gradient(135deg,var(--tera-violet),var(--tera-cyan));display:flex;align-items:center;justify-content:center;font-family:'Chakra Petch',sans-serif;font-size:${Math.round(size*0.4)}px;font-weight:700;color:#0a0c14;">${initials}</div>`;
  }

  if(!hasEffect) return innerHtml;

  ensureAvatarFxStyles();
  const color = effectColor || '#4fd8d0';
  const wrapPad = Math.max(Math.round(size*0.28), 10);
  const wrapSize = size + wrapPad*2;
  const particles = avatarFxParticlesHtml(effectType, 42);
  const multiClass = multiColor ? ' avatar-fx-multicolor' : '';

  return `<div class="avatar-fx-wrap" style="--fx-color:${color};width:${wrapSize}px;height:${wrapSize}px;">
    <div class="avatar-fx-layer avatar-fx-${effectType}${multiClass}">${particles}</div>
    ${innerHtml}
  </div>`;
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
  const bgCosmetic = profile.equippedBackground ? getCosmeticById(profile.equippedBackground) : null;
  const frameCosmetic = profile.equippedFrame ? getCosmeticById(profile.equippedFrame) : null;
  const accentCosmetic = profile.equippedAccent ? getCosmeticById(profile.equippedAccent) : null;
  const nameEffectCosmetic = profile.equippedNameEffect ? getCosmeticById(profile.equippedNameEffect) : null;
  const titleCosmetic = profile.equippedTitle ? getCosmeticById(profile.equippedTitle) : null;
  const equippedBadgeEmojis = (profile.equippedBadges || []).map(id=>getCosmeticById(id)).filter(Boolean).map(b=>b.emoji).join(' ');
  const accentColor = accentCosmetic ? accentCosmetic.color : 'var(--text-main)';
  const avatar = avatarHtml(name, profile.photo_url, 40, bgCosmetic ? bgCosmetic.color : null, frameCosmetic ? frameCosmetic.effect : null, bgCosmetic ? !!bgCosmetic.multiColor : false);
  const trophy = trophyEmojiFor(name, currentTrophies);
  const elo = eloRatings ? (eloRatings[name] || 1000) : null;
  const hasCustomBg = (profile.ownedCosmetics||[]).includes('feature_custom_pagebg') && !!profile.profileBackgroundUrl;

  let statsLine = 'Ainda sem torneios registrados.';
  if(st){
    const total = st.wins + st.losses;
    const wr = total ? Math.round((st.wins/total)*100) : 0;
    statsLine = `${st.wins}V - ${st.losses}D (${wr}%) · ${st.titles} título(s)`;
  }

  const html = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      ${avatar}
      <div>
        <div style="font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:14px;color:${accentColor};${nameEffectCosmetic ? nameEffectCosmetic.css : ''}">${trophy} ${escapeHtml(displayName)} ${equippedBadgeEmojis}</div>
        ${profile.nickname ? `<div style="font-size:10.5px;color:var(--text-faint);">${escapeHtml(name)}</div>` : ''}
        ${titleCosmetic && titleCosmetic.text ? `<div style="font-size:10.5px;color:var(--text-dim);">${escapeHtml(titleCosmetic.text)}</div>` : ''}
      </div>
    </div>
    ${elo!==null ? `<div style="font-size:11.5px;color:var(--tera-amber);margin-bottom:4px;">Elo: ${elo}</div>` : ''}
    <div style="font-size:12px;color:var(--text-dim);">${statsLine}</div>
    ${profile.status_message ? `<div style="font-size:11.5px;color:var(--text-dim);font-style:italic;margin-top:6px;">"${escapeHtml(profile.status_message)}"</div>` : ''}
  `;

  return { html, hasCustomBg, bgUrl: hasCustomBg ? profile.profileBackgroundUrl : null };
}

// Aplica (ou limpa) o fundo personalizado no próprio elemento do mini-perfil
// — chamado depois de definir o innerHTML, já que o innerHTML não mexe no
// estilo do contentor.
function applyHoverCardBackground(cardEl, result){
  if(result.hasCustomBg && result.bgUrl){
    cardEl.style.backgroundImage = `linear-gradient(rgba(10,12,20,0.82),rgba(10,12,20,0.82)), url('${result.bgUrl.replace(/'/g,"\\'")}')`;
    cardEl.style.backgroundSize = 'cover';
    cardEl.style.backgroundPosition = 'center';
  } else {
    cardEl.style.backgroundImage = '';
    cardEl.style.backgroundSize = '';
    cardEl.style.backgroundPosition = '';
  }
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

// ---------- Presente Surpresa: compra um cosmético aleatório para OUTRO jogador ----------
const SURPRISE_GIFT_PRICE = 40;

// Devolve {ok, reason, item} — 'insufficient' | 'nooptions' | 'invalid' | 'error' | true
async function giftSurpriseCosmetic(supabaseUrl, supabaseAnonKey, fromName, toName){
  if(fromName === toName) return {ok:false, reason:'invalid'};

  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(fromName)}&select=coins`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  if((rows[0].coins||0) < SURPRISE_GIFT_PRICE) return {ok:false, reason:'insufficient'};

  const toRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(toName)}&select=owned_cosmetics`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const toRows = await toRes.json();
  if(!toRows || !toRows[0]) return {ok:false, reason:'error'};
  const toOwned = toRows[0].owned_cosmetics || [];

  const allAvailable = [];
  LOOT_BOX_CATEGORIES.forEach(cat=>{
    (COSMETIC_CATALOG[cat]||[]).forEach(item=>{
      if(item.price > 0 && !toOwned.includes(item.id)) allAvailable.push(item);
    });
  });
  if(!allAvailable.length) return {ok:false, reason:'nooptions'};
  const won = allAvailable[Math.floor(Math.random()*allAvailable.length)];

  const fromOk = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, fromName, -SURPRISE_GIFT_PRICE, `Presente Surpresa para ${toName}: ${won.name}`);
  if(!fromOk) return {ok:false, reason:'error'};

  const newOwned = toOwned.concat([won.id]);
  const patchRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(toName)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ owned_cosmetics: newOwned })
  });
  if(!patchRes.ok){
    await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, fromName, SURPRISE_GIFT_PRICE, 'Estorno de Presente Surpresa (falhou)');
    return {ok:false, reason:'error'};
  }
  await logCoinTransaction(supabaseUrl, supabaseAnonKey, toName, 0, `Recebeu Presente Surpresa de ${fromName}: ${won.name}`);
  return {ok:true, item: won};
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
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins,max_coins_reached`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    if(!rows || !rows[0]) return false;
    const newCoins = Math.max(0, (rows[0].coins || 0) + amount);
    const newMax = Math.max(rows[0].max_coins_reached || 0, newCoins);
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({ coins: newCoins, max_coins_reached: newMax })
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
const ALL_TIERS = ['OU','UU','RU','NU','PU','ZU','National Dex','National Dex AG','National Dex LC','National Dex UU','National Dex RU'];

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
// Regista quando um jogador aposta TODO o saldo que tinha, de uma vez —
// usado pela conquista secreta "Sem Medo".
async function recordAllInIfApplicable(supabaseUrl, supabaseAnonKey, name, betAmount, currentCoins){
  if(betAmount < currentCoins || currentCoins <= 0) return;
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=all_in_count`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    if(!rows || !rows[0]) return;
    await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({ all_in_count: (rows[0].all_in_count || 0) + 1 })
    });
  } catch(e){ /* nao critico */ }
}

async function spinRoulette(supabaseUrl, supabaseAnonKey, name, betAmount){
  if(!betAmount || betAmount <= 0) return {ok:false, reason:'invalid'};
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  if((rows[0].coins||0) < betAmount) return {ok:false, reason:'insufficient'};
  await recordAllInIfApplicable(supabaseUrl, supabaseAnonKey, name, betAmount, rows[0].coins||0);

  const outcome = pickRouletteOutcome();
  const payout = Math.round(betAmount * outcome.multiplier);
  const net = payout - betAmount;

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
  const accentCosmetic = profile.equippedAccent ? getCosmeticById(profile.equippedAccent) : null;
  const avatar = avatarHtml(name, profile.photo_url, 28, bgCosmetic ? bgCosmetic.color : null, frameCosmetic ? frameCosmetic.effect : null, bgCosmetic ? !!bgCosmetic.multiColor : false);
  return `<a href="perfil.html" class="player-corner-badge" title="Ver o meu perfil">
    ${avatar}
    <span class="player-corner-name" style="${accentCosmetic ? `color:${accentCosmetic.color};` : ''}">${escapeHtml(displayName)}</span>
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
  { id:'first_tournament',     name:'Estreante',           emoji:'🌟', desc:'Jogou o seu primeiro torneio', tier:'bronze' },
  { id:'first_win',           name:'Primeira Vitória',    emoji:'🥇', desc:'Venceu a primeira partida', tier:'bronze' },
  { id:'ten_wins',             name:'Veterano de Guerra',  emoji:'⚔️', desc:'10 vitórias no total', tier:'silver' },
  { id:'five_tournaments',     name:'Assíduo',             emoji:'🎮', desc:'Jogou 5 torneios', tier:'bronze' },
  { id:'win_streak_3',         name:'Em Chamas',           emoji:'🔥', desc:'3 vitórias seguidas', tier:'bronze' },
  { id:'win_streak_5',         name:'Imparável',           emoji:'⚡', desc:'5 vitórias seguidas', tier:'silver' },
  { id:'first_title',          name:'Campeão',             emoji:'🏆', desc:'Venceu o primeiro torneio', tier:'silver' },
  { id:'three_titles',         name:'Dinastia',            emoji:'💎', desc:'3 títulos conquistados', tier:'gold' },
  { id:'multi_tier_champion',  name:'Poliglota',           emoji:'👑', desc:'Campeão em 2 tiers diferentes', tier:'gold' },
  { id:'immortal',              name:'Imortal',             emoji:'🛡️', desc:'20 vitórias no total', tier:'gold' },
  { id:'legend',                name:'Lenda',               emoji:'🏵️', desc:'5 títulos conquistados', tier:'gold' },
  { id:'precision',             name:'Precisão',            emoji:'🎯', desc:'Winrate de 70%+ (mínimo 10 partidas)', tier:'silver' },
  { id:'omnipresent',           name:'Onipresente',         emoji:'🌍', desc:'Já jogou pelo menos uma vez em 6 tiers diferentes', tier:'silver' },
  { id:'survivor',              name:'Sobrevivente',        emoji:'🌱', desc:'Foi campeão depois de ter passado pelo Play-in', tier:'gold' },
  { id:'perfectionist',         name:'Perfeição',           emoji:'💯', desc:'Foi campeão sem perder nenhuma partida — e sem perder nenhum jogo em nenhuma Bo3 (só vitórias 2-0)', tier:'gold' },
  { id:'comeback',              name:'Reviravolta',         emoji:'🔄', desc:'Venceu uma Bo3 depois de perder o primeiro jogo', tier:'silver' },
  { id:'sharp_bettor',          name:'Apostador Fino',      emoji:'🔮', desc:'10 palpites certos no Palpiteiro', tier:'silver' },
  { id:'lucky_strike',          name:'Golpe de Sorte',      emoji:'🎰', desc:'Tirou o Jackpot (5x) na Roleta pelo menos uma vez', tier:'bronze' },
  { id:'creative_namer',        name:'Nomeador Criativo',   emoji:'✍️', desc:'Deu apelido a 10 Pokémon diferentes', tier:'bronze' },
  { id:'perfect_attendance',    name:'Presença Perfeita',   emoji:'📅', desc:'Participou de 5 torneios seguidos', tier:'silver' },
  { id:'eternal_rival',         name:'Rival Eterno',        emoji:'🗡️', desc:'Venceu o mesmo adversário pelo menos 5 vezes', tier:'silver' },
  { id:'serial_underdog',       name:'Zebra em Série',      emoji:'🦓', desc:'Venceu como underdog (Elo pelo menos 100 pontos mais baixo) pelo menos 3 vezes', tier:'gold' },
  { id:'recognized_mvp',        name:'MVP Reconhecido',     emoji:'🌠', desc:'Foi eleito MVP de um bloco de 3 torneios pelo menos uma vez', tier:'silver' },
  { id:'back_to_back',          name:'Bicampeão',           emoji:'🏛️', desc:'Foi campeão em pelo menos 2 temporadas diferentes', tier:'gold' },
  { id:'lucky_streak_bettor',   name:'Apostador Nato',      emoji:'🎟️', desc:'Acertou 3 palpites seguidos no Palpiteiro', tier:'bronze' },
  { id:'voice_of_the_people',   name:'Voz do Povo',         emoji:'📣', desc:'Venceu a votação de Apelido da Semana pelo menos uma vez', tier:'bronze' },
  { id:'investor',              name:'Investidor',          emoji:'💰', desc:'Chegou a ter 1000 moedas de saldo ao mesmo tempo', tier:'silver' },
  { id:'phoenix',                name:'Fênix',               emoji:'🐦‍🔥', desc:'Perdeu 5 partidas seguidas, mas continuou a participar no torneio seguinte', tier:'silver', secret:true },
  { id:'close_call',             name:'Sortudo do Destino',  emoji:'🎲', desc:'Venceu uma Bo3 decidida por pouco (2x1)', tier:'bronze', secret:true },
  { id:'impossible_hunt',        name:'Caçada Impossível',   emoji:'🐺', desc:'Venceu um jogador com pelo menos 200 pontos de Elo a mais', tier:'gold', secret:true },
  { id:'early_bird',             name:'Madrugador',          emoji:'🌅', desc:'Importou um set no mesmo dia em que o torneio foi criado, em 3 torneios diferentes', tier:'silver', secret:true },
  { id:'philanthropist',         name:'Filantropo',          emoji:'💝', desc:'Deu mais de 500 moedas em presentes ao longo do tempo', tier:'gold', secret:true },
  { id:'no_fear',                name:'Sem Medo',            emoji:'🃏', desc:'Apostou todo o saldo que tinha de uma vez, na Roleta ou numa aposta de campeão', tier:'bronze', secret:true },
  { id:'full_collector',         name:'Colecionador Completo', emoji:'🏅', desc:'Comprou todos os cosméticos de uma categoria inteira', tier:'gold', secret:true },
  { id:'night_owl',              name:'Coruja Noturna',      emoji:'🦉', desc:'Reclamou o bónus diário entre meia-noite e as 5 da manhã', tier:'bronze', secret:true },
  { id:'active_voice',           name:'Voz Ativa',           emoji:'🗳️', desc:'Votou em pelo menos 5 votações de tier diferentes', tier:'bronze' },
  { id:'popular',                name:'Popular',             emoji:'🎉', desc:'Foi presenteado por pelo menos 3 jogadores diferentes', tier:'silver' },
  { id:'frequent_buyer',         name:'Comprador Assíduo',   emoji:'🛍️', desc:'Já acumulou pelo menos 10 cosméticos diferentes', tier:'bronze' },
  { id:'pot_king',                name:'Rei do Pote',         emoji:'🫙', desc:'Ganhou uma rodada da Loteria com o pote acumulado em pelo menos 🪙150', tier:'gold' },
  { id:'compulsive_rerolls',     name:'Trocador Compulsivo', emoji:'♻️', desc:'Pediu reroll pelo menos 5 vezes', tier:'bronze', secret:true },
  { id:'auctioneer',              name:'Leiloeiro',           emoji:'🔨', desc:'Venceu um leilão de item raro pelo menos uma vez', tier:'silver', secret:true },
  { id:'golden_ticket',           name:'Bilhete Dourado',     emoji:'🎫', desc:'Ganhou a Loteria com apenas 1 bilhete comprado nessa rodada', tier:'gold', secret:true },
  { id:'crowned_underdog',        name:'Azarão Coroado',      emoji:'🎖️', desc:'Foi campeão de um torneio tendo o menor Elo entre todos os participantes', tier:'gold', secret:true },
  { id:'daily_starter',           name:'Hábito em Formação',  emoji:'🔔', desc:'Reclamou o bónus diário 3 vezes', tier:'bronze' },
  { id:'daily_week',              name:'Semana Completa',     emoji:'📆', desc:'Reclamou o bónus diário 7 vezes', tier:'bronze' },
  { id:'daily_month_streak',      name:'Um Mês Sem Falhar',   emoji:'🗓️', desc:'Manteve uma sequência de 31 dias seguidos de bónus diário', tier:'gold', secret:true },
  { id:'early_riser',             name:'Madrugador Nato',     emoji:'⏰', desc:'Reclamou o bónus diário 20 vezes no total', tier:'silver' },
  { id:'group_loyal',             name:'Fiel ao Grupo',       emoji:'🤝', desc:'Participou em torneios durante 3 temporadas diferentes', tier:'silver' },
  { id:'recurring_giver',         name:'Generosidade Recorrente', emoji:'🎁', desc:'Deu presentes a pelo menos 5 jogadores diferentes ao longo do tempo', tier:'silver' },
  { id:'insomniac',               name:'Insone',              emoji:'🌙', desc:'Reclamou o bónus diário entre meia-noite e as 5h em pelo menos 3 dias diferentes', tier:'gold', secret:true }
];

// stats vem de aggregatePlayers()[nome]; streak vem de computeAllCurrentStreaks()[nome].
// Devolve um Set com os ids das conquistas já desbloqueadas.
function computeAchievements(stats, bestWinStreakCount){
  const earned = new Set();
  if(!stats) return earned;
  if(stats.tournaments.length >= 1) earned.add('first_tournament');
  if(stats.wins >= 1) earned.add('first_win');
  if(stats.wins >= 10) earned.add('ten_wins');
  if(stats.wins >= 20) earned.add('immortal');
  if(stats.tournaments.length >= 5) earned.add('five_tournaments');
  if((bestWinStreakCount||0) >= 3) earned.add('win_streak_3');
  if((bestWinStreakCount||0) >= 5) earned.add('win_streak_5');
  if(stats.titles >= 1) earned.add('first_title');
  if(stats.titles >= 3) earned.add('three_titles');
  if(stats.titles >= 5) earned.add('legend');
  if(Object.keys(stats.titlesByTier || {}).length >= 2) earned.add('multi_tier_champion');
  // Nota: "Precisão" (winrate 70%+) NÃO fica aqui de propósito — winrate
  // geral pode CAIR com o tempo (não é cumulativo como vitórias/torneios),
  // por isso precisa de olhar para o histórico cronológico completo em vez
  // do total atual. Ver computeMatchPathAchievements.
  return earned;
}

// Maior sequência de vitórias JÁ ALCANÇADA por cada jogador (não a sequência
// atual) — usada para as conquistas "Em Chamas" e "Imparável", que uma vez
// desbloqueadas devem continuar desbloqueadas para sempre, mesmo que o
// jogador perca uma partida depois. Devolve { nome: maiorSequência }.
function computeAllBestWinStreaks(allRows){
  const sequences = {};
  const sorted = allRows.slice().sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
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
  const bests = {};
  Object.entries(sequences).forEach(([name, seq])=>{
    let best = 0, run = 0;
    seq.forEach(s=>{
      run = s === 'win' ? run+1 : 0;
      best = Math.max(best, run);
    });
    bests[name] = best;
  });
  return bests;
}

// Conquistas que dependem do PERCURSO de torneios específicos (não só do
// total agregado) — continuam síncronas, já que só precisam de allRows
// (já carregado), sem consultas extra à base de dados.
function computeMatchPathAchievements(name, allRows, profile){
  const earned = new Set();
  const tiersPlayed = new Set();
  const winsByOpponent = {};
  let closeBo3Win = false;

  allRows.forEach(r=>{
    const data = r.data || {};
    const players = data.players || [];
    if(players.includes(name)) tiersPlayed.add(data.tier || r.tier);

    const matches = data.matches || [];
    if(data.champion === name){
      const myMatches = matches.filter(m => m.winner && (m.p1===name || m.p2===name));
      const wonEveryMatch = myMatches.length > 0 && myMatches.every(m => m.winner === name);
      // Numa Bo3, "perfeição" exige 2x0 — perder qualquer jogo dentro da série já invalida.
      const wonEveryGameCleanly = myMatches.every(m => {
        if(m.bo === 3 && Array.isArray(m.games)){
          return m.games.every(g => !g || g === name);
        }
        return true;
      });
      if(wonEveryMatch && wonEveryGameCleanly) earned.add('perfectionist');
      const playedPlayIn = myMatches.some(m => m.label === 'Play-in');
      if(playedPlayIn) earned.add('survivor');
    }
    matches.forEach(m=>{
      if(m.bo === 3 && m.winner === name && m.games && m.games[0] && m.games[0] !== name){
        earned.add('comeback');
      }
      // Rival Eterno: contagem de vitórias contra cada adversário específico.
      if(m.winner === name && (m.p1===name || m.p2===name)){
        const opponent = m.p1 === name ? m.p2 : m.p1;
        if(opponent) winsByOpponent[opponent] = (winsByOpponent[opponent]||0) + 1;
      }
      // Sortudo do Destino: venceu uma Bo3 apertada, decidida 2x1.
      if(m.bo === 3 && m.winner === name && Array.isArray(m.games) && m.games.length === 3){
        closeBo3Win = true;
      }
    });
  });

  if(tiersPlayed.size >= 6) earned.add('omnipresent');
  if(Object.values(winsByOpponent).some(c => c >= 5)) earned.add('eternal_rival');
  if(closeBo3Win) earned.add('close_call');
  if(computePhoenixComeback(allRows, name)) earned.add('phoenix');

  const myNicknames = new Set(
    aggregateNicknames(allRows).filter(n=>n.playerName===name).map(n=>n.nickname.toLowerCase())
  );
  if(myNicknames.size >= 10) earned.add('creative_namer');

  if(computeBestParticipationStreak(allRows, name) >= 5) earned.add('perfect_attendance');

  if(computeUpsetWins(allRows, name, 100) >= 3) earned.add('serial_underdog');
  if(computeUpsetWins(allRows, name, 200) >= 1) earned.add('impossible_hunt');

  if(computeMvpBatches(allRows).some(b => b.mvp && b.mvp.name === name)) earned.add('recognized_mvp');

  if(computeChampionSeasonsCount(allRows, name) >= 2) earned.add('back_to_back');

  if(computeParticipationSeasonsCount(allRows, name) >= 3) earned.add('group_loyal');

  if(computeCompletedCosmeticCategory(profile)) earned.add('full_collector');

  if(computeEverReachedWinrateThreshold(allRows, name, 10, 0.7)) earned.add('precision');

  if(profile && (profile.ownedCosmetics||[]).length >= 10) earned.add('frequent_buyer');

  if(computeUnderdogChampionship(allRows, name)) earned.add('crowned_underdog');

  return earned;
}

// Verifica se, em ALGUM ponto da história cronológica do jogador (depois de
// ter jogado pelo menos minGames partidas), o winrate-até-ali alguma vez
// bateu minWinrate — ao contrário de olhar só para o total atual (que pode
// cair com o tempo), isto torna a conquista permanente uma vez alcançada.
function computeEverReachedWinrateThreshold(allRows, name, minGames, minWinrate){
  const sequence = [];
  const sorted = allRows.slice().sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
  sorted.forEach(r=>{
    ((r.data||{}).matches || []).forEach(m=>{
      if(!m.winner || (m.p1!==name && m.p2!==name)) return;
      sequence.push(m.winner === name ? 1 : 0);
    });
  });
  let wins = 0;
  for(let i=0; i<sequence.length; i++){
    wins += sequence[i];
    const total = i+1;
    if(total >= minGames && (wins/total) >= minWinrate) return true;
  }
  return false;
}

// Conta quantas vezes o jogador venceu como "underdog" — o adversário tinha
// pelo menos minGap pontos de Elo a mais, calculado com o Elo de CADA UM no
// momento exato dessa partida (replica a mesma evolução usada em computeEloRatings).
function computeUpsetWins(allRows, name, minGap){
  const ratings = {};
  const K = 32, BASE = 1000;
  function getRating(n){ if(!(n in ratings)) ratings[n] = BASE; return ratings[n]; }
  let count = 0;
  const sorted = allRows.slice().sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  sorted.forEach(r=>{
    const matches = (r.data || {}).matches || [];
    matches.forEach(m=>{
      if(!m.winner || !m.p1 || !m.p2) return;
      const winner = m.winner, loser = winner === m.p1 ? m.p2 : m.p1;
      const rWinner = getRating(winner), rLoser = getRating(loser);
      if(winner === name && (rLoser - rWinner) >= minGap) count++;
      const expectedWinner = 1 / (1 + Math.pow(10, (rLoser - rWinner) / 400));
      ratings[winner] = rWinner + K * (1 - expectedWinner);
      ratings[loser] = rLoser + K * (0 - (1 - expectedWinner));
    });
  });
  return count;
}

// Verifica se o jogador alguma vez foi campeão de um torneio tendo o Elo mais
// baixo entre todos os participantes NAQUELE momento (antes do torneio
// começar) — usa a mesma evolução cronológica de Elo que "Zebra em Série".
function computeUnderdogChampionship(allRows, name){
  const ratings = {};
  const K = 32, BASE = 1000;
  function getRating(n){ if(!(n in ratings)) ratings[n] = BASE; return ratings[n]; }
  const sorted = allRows.slice().sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  let found = false;

  sorted.forEach(r=>{
    const data = r.data || {};
    const players = (data.players || []).filter(Boolean);

    if(data.champion === name && players.length > 1){
      const myRating = getRating(name);
      const isLowestOrTied = players.every(p => p === name || getRating(p) >= myRating);
      if(isLowestOrTied) found = true;
    }

    const matches = data.matches || [];
    matches.forEach(m=>{
      if(!m.winner || !m.p1 || !m.p2) return;
      const winner = m.winner, loser = winner === m.p1 ? m.p2 : m.p1;
      const rWinner = getRating(winner), rLoser = getRating(loser);
      const expectedWinner = 1 / (1 + Math.pow(10, (rLoser - rWinner) / 400));
      ratings[winner] = rWinner + K * (1 - expectedWinner);
      ratings[loser] = rLoser + K * (0 - (1 - expectedWinner));
    });
  });
  return found;
}

// Fênix: teve uma sequência de 5 derrotas seguidas, mas continuou a jogar depois.
function computePhoenixComeback(allRows, name){
  const sequence = [];
  const sorted = allRows.slice().sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
  sorted.forEach(r=>{
    ((r.data||{}).matches || []).forEach(m=>{
      if(!m.winner || (m.p1!==name && m.p2!==name)) return;
      sequence.push(m.winner === name ? 'win' : 'loss');
    });
  });
  let run = 0;
  for(let i=0;i<sequence.length;i++){
    run = sequence[i]==='loss' ? run+1 : 0;
    if(run >= 5 && i < sequence.length-1) return true;
  }
  return false;
}

// Bicampeão: foi campeão em pelo menos 2 temporadas diferentes.
function computeChampionSeasonsCount(allRows, name){
  const anchor = getSeasonAnchor(allRows);
  if(!anchor) return 0;
  const maxSeason = Math.max(1, ...allRows.map(r => computeSeasonNumber(r.created_at, anchor)));
  let count = 0;
  for(let s=1; s<=maxSeason; s++){
    const seasonRows = filterRowsBySeason(allRows, s);
    const stats = aggregatePlayers(seasonRows)[name];
    if(stats && stats.titles > 0) count++;
  }
  return count;
}

// Em quantas temporadas diferentes o jogador participou de pelo menos um
// torneio (não precisa ser seguidas, ao contrário do Bicampeão que exige
// título). Usado pela conquista "Fiel ao Grupo".
function computeParticipationSeasonsCount(allRows, name){
  const anchor = getSeasonAnchor(allRows);
  if(!anchor) return 0;
  const maxSeason = Math.max(1, ...allRows.map(r => computeSeasonNumber(r.created_at, anchor)));
  let count = 0;
  for(let s=1; s<=maxSeason; s++){
    const seasonRows = filterRowsBySeason(allRows, s);
    const stats = aggregatePlayers(seasonRows)[name];
    if(stats && stats.tournaments && stats.tournaments.length > 0) count++;
  }
  return count;
}

// Colecionador Completo: já possui TODOS os itens compráveis de uma categoria inteira.
function computeCompletedCosmeticCategory(profile){
  if(!profile) return false;
  const owned = new Set(profile.ownedCosmetics || []);
  return ['backgrounds','accents','frames','nameEffects','titles','badges'].some(cat=>{
    const purchasable = (COSMETIC_CATALOG[cat]||[]).filter(i=>i.price > 0 && !i.auctionOnly);
    return purchasable.length > 0 && purchasable.every(i => owned.has(i.id));
  });
}

// Quantos torneios seguidos (do mais recente para trás) o jogador participou
// sem falhar nenhum — independente de ganhar ou perder. Usado só para exibir
// "sequência atual", NÃO para a conquista (ver computeBestParticipationStreak).
function computeParticipationStreak(allRows, name){
  const sorted = allRows.slice().sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
  let streak = 0;
  for(const r of sorted){
    const players = (r.data && r.data.players) || [];
    if(players.includes(name)) streak++;
    else break;
  }
  return streak;
}

// Maior sequência de participação JÁ ALCANÇADA em toda a história — ao
// contrário da função acima, esta nunca "quebra" retroativamente, por isso é
// segura para conquistas permanentes como "Presença Perfeita".
function computeBestParticipationStreak(allRows, name){
  const sorted = allRows.slice().sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
  let best = 0, run = 0;
  sorted.forEach(r=>{
    const players = (r.data && r.data.players) || [];
    if(players.includes(name)){
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  });
  return best;
}

// Conquistas que dependem de OUTRAS tabelas (palpites, transações de moedas)
// — precisam de consultas assíncronas extra à base de dados.
async function computeAsyncAchievements(supabaseUrl, supabaseAnonKey, name, allRows){
  const earned = new Set();

  try{
    const predRes = await fetch(`${supabaseUrl}/rest/v1/predictions?predictor_name=eq.${encodeURIComponent(name)}&select=correct,created_at&order=created_at.asc`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const predRows = await predRes.json();
    if(Array.isArray(predRows)){
      const resolved = predRows.filter(p=>p.correct !== null);
      if(resolved.filter(p=>p.correct===true).length >= 10) earned.add('sharp_bettor');
      // Apostador Nato: alguma vez teve 3 palpites certos SEGUIDOS (ordem cronológica).
      let run = 0, bestRun = 0;
      resolved.forEach(p=>{ run = p.correct ? run+1 : 0; bestRun = Math.max(bestRun, run); });
      if(bestRun >= 3) earned.add('lucky_streak_bettor');
    }
  } catch(e){ /* ignora silenciosamente */ }

  try{
    // "ilike" (sem diferenciar maiúsculas/minúsculas) para apanhar tanto o texto
    // atual ("Jackpot 5x!") como o texto antigo de quando tínhamos o jackpot
    // progressivo ("JACKPOT PROGRESSIVO", em maiúsculas) — histórico incluído.
    const jackpotRes = await fetch(`${supabaseUrl}/rest/v1/coin_transactions?player_name=eq.${encodeURIComponent(name)}&reason=ilike.*jackpot*&select=id&limit=1`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const jackpotRows = await jackpotRes.json();
    if(Array.isArray(jackpotRows) && jackpotRows.length >= 1) earned.add('lucky_strike');
  } catch(e){ /* ignora silenciosamente */ }

  try{
    // Voz do Povo: já venceu a votação de Apelido da Semana pelo menos uma vez
    // (procura no registo de auditoria, onde fica registado quando é apurado).
    const pattern = encodeURIComponent(`*de ${name} venceu a vota*`);
    const voiceRes = await fetch(`${supabaseUrl}/rest/v1/activity_log?category=eq.jogadores&action=ilike.${pattern}&select=id&limit=1`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const voiceRows = await voiceRes.json();
    if(Array.isArray(voiceRows) && voiceRows.length >= 1) earned.add('voice_of_the_people');
  } catch(e){ /* ignora silenciosamente */ }

  try{
    const giftsRes = await fetch(`${supabaseUrl}/rest/v1/gifts?from_name=eq.${encodeURIComponent(name)}&select=amount,to_name`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const giftsRows = await giftsRes.json();
    const recipients = new Set();
    let coinTotal = 0;
    if(Array.isArray(giftsRows)){
      giftsRows.forEach(g=>{
        coinTotal += (g.amount||0);
        if(g.to_name) recipients.add(g.to_name);
      });
    }
    if(coinTotal >= 500) earned.add('philanthropist');

    // Generosidade Recorrente: junta destinatários de presentes de moedas
    // E de Presente Surpresa, para contar quantos jogadores DIFERENTES já
    // foram presenteados por este jogador, no total.
    const surpriseRes = await fetch(`${supabaseUrl}/rest/v1/coin_transactions?player_name=eq.${encodeURIComponent(name)}&reason=like.Presente%20Surpresa%20para*&select=reason`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const surpriseRows = await surpriseRes.json();
    if(Array.isArray(surpriseRows)){
      surpriseRows.forEach(r=>{
        const match = (r.reason||'').match(/Presente Surpresa para (.+?):/);
        if(match) recipients.add(match[1]);
      });
    }
    if(recipients.size >= 5) earned.add('recurring_giver');
  } catch(e){ /* ignora silenciosamente */ }

  try{
    const playerRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=max_coins_reached,all_in_count,total_daily_claims,best_daily_streak`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const playerRows = await playerRes.json();
    if(Array.isArray(playerRows) && playerRows[0]){
      if((playerRows[0].max_coins_reached||0) >= 1000) earned.add('investor');
      if((playerRows[0].all_in_count||0) >= 1) earned.add('no_fear');
      if((playerRows[0].total_daily_claims||0) >= 3) earned.add('daily_starter');
      if((playerRows[0].total_daily_claims||0) >= 7) earned.add('daily_week');
      if((playerRows[0].total_daily_claims||0) >= 20) earned.add('early_riser');
      if((playerRows[0].best_daily_streak||0) >= 31) earned.add('daily_month_streak');
    }
  } catch(e){ /* ignora silenciosamente */ }

  try{
    // Coruja Noturna: reclamou o bónus diário entre meia-noite e as 5h (só uma vez já basta).
    // Insone: o mesmo, mas em pelo menos 3 dias DIFERENTES (upgrade da anterior).
    const nightRes = await fetch(`${supabaseUrl}/rest/v1/coin_transactions?player_name=eq.${encodeURIComponent(name)}&reason=like.Bônus%20diário*&select=created_at`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const nightRows = await nightRes.json();
    if(Array.isArray(nightRows)){
      const nightDates = new Set();
      nightRows.forEach(t=>{
        const dt = new Date(t.created_at);
        if(dt.getHours() >= 0 && dt.getHours() < 5) nightDates.add(dt.toISOString().slice(0,10));
      });
      if(nightDates.size >= 1) earned.add('night_owl');
      if(nightDates.size >= 3) earned.add('insomniac');
    }
  } catch(e){ /* ignora silenciosamente */ }

  try{
    // Madrugador: importou um set no MESMO DIA em que o torneio foi criado, em 3 torneios diferentes.
    const importRes = await fetch(`${supabaseUrl}/rest/v1/activity_log?actor_name=eq.${encodeURIComponent(name)}&category=eq.sorteio&action=like.Importou%20um%20set*&select=created_at`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const importRows = await importRes.json();
    if(Array.isArray(importRows) && importRows.length && allRows){
      const importDates = new Set(importRows.map(l => new Date(l.created_at).toISOString().slice(0,10)));
      let sameDayCount = 0;
      allRows.forEach(r=>{
        const tDate = new Date(r.created_at).toISOString().slice(0,10);
        if(importDates.has(tDate)) sameDayCount++;
      });
      if(sameDayCount >= 3) earned.add('early_bird');
    }
  } catch(e){ /* ignora silenciosamente */ }

  try{
    // Voz Ativa: os votos de tier são apagados a cada torneio novo, por isso
    // conta-se a partir do registo de auditoria (permanente) em vez da
    // tabela de votos em si.
    const votePattern = encodeURIComponent('Votou*no tier*');
    const voteRes = await fetch(`${supabaseUrl}/rest/v1/activity_log?actor_name=eq.${encodeURIComponent(name)}&category=eq.loja&action=like.${votePattern}&select=id`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const voteRows = await voteRes.json();
    if(Array.isArray(voteRows) && voteRows.length >= 5) earned.add('active_voice');
  } catch(e){ /* ignora silenciosamente */ }

  try{
    // Popular: recebeu presentes de pelo menos 3 jogadores diferentes.
    const giftsRecRes = await fetch(`${supabaseUrl}/rest/v1/gifts?to_name=eq.${encodeURIComponent(name)}&select=from_name`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const giftsRecRows = await giftsRecRes.json();
    if(Array.isArray(giftsRecRows)){
      const distinctGivers = new Set(giftsRecRows.map(g=>g.from_name));
      if(distinctGivers.size >= 3) earned.add('popular');
    }
  } catch(e){ /* ignora silenciosamente */ }

  try{
    // Trocador Compulsivo: pediu reroll pelo menos 5 vezes (qualquer status).
    const rerollRes = await fetch(`${supabaseUrl}/rest/v1/reroll_requests?player_name=eq.${encodeURIComponent(name)}&select=id`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rerollRows = await rerollRes.json();
    if(Array.isArray(rerollRows) && rerollRows.length >= 5) earned.add('compulsive_rerolls');
  } catch(e){ /* ignora silenciosamente */ }

  try{
    // Leiloeiro: venceu pelo menos um leilão concluído.
    const auctionPattern = encodeURIComponent(`*${name}*`);
    const auctionRes = await fetch(`${supabaseUrl}/rest/v1/auctions?status=eq.concluded&winner_name=ilike.${auctionPattern}&select=id&limit=1`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const auctionRows = await auctionRes.json();
    if(Array.isArray(auctionRows) && auctionRows.length >= 1) earned.add('auctioneer');
  } catch(e){ /* ignora silenciosamente */ }

  try{
    // Rei do Pote / Bilhete Dourado: precisa de olhar para as rodadas da
    // Loteria que este jogador venceu, e para cada uma, quantos bilhetes
    // tinha nessa rodada específica.
    const wonPattern = encodeURIComponent(`*${name}*`);
    const wonRoundsRes = await fetch(`${supabaseUrl}/rest/v1/lottery_rounds?status=eq.concluded&winner_name=ilike.${wonPattern}&select=id,pot`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const wonRounds = await wonRoundsRes.json();
    if(Array.isArray(wonRounds) && wonRounds.length){
      if(wonRounds.some(r => (r.pot||0) >= 150)) earned.add('pot_king');

      for(const round of wonRounds){
        const ticketsRes = await fetch(`${supabaseUrl}/rest/v1/lottery_tickets?round_id=eq.${round.id}&buyer_name=eq.${encodeURIComponent(name)}&select=ticket_count`, {headers: sbAuthHeaders(supabaseAnonKey)});
        const ticketsRows = await ticketsRes.json();
        const totalTickets = Array.isArray(ticketsRows) ? ticketsRows.reduce((s,t)=>s+(t.ticket_count||0), 0) : 0;
        if(totalTickets === 1){ earned.add('golden_ticket'); break; }
      }
    }
  } catch(e){ /* ignora silenciosamente */ }

  return earned;
}

// Junta as três fontes (agregado, percurso, outras tabelas) numa só chamada.
async function computeAllAchievements(supabaseUrl, supabaseAnonKey, name, stats, streak, allRows, profile){
  const bestWinStreak = computeAllBestWinStreaks(allRows)[name] || 0;
  const earned = computeAchievements(stats, bestWinStreak);
  computeMatchPathAchievements(name, allRows, profile).forEach(id=>earned.add(id));
  const asyncOnes = await computeAsyncAchievements(supabaseUrl, supabaseAnonKey, name, allRows);
  asyncOnes.forEach(id=>earned.add(id));
  return earned;
}

// Devolve, para cada conquista do catálogo, quantos e que % dos jogadores já a têm.
// Ordenado da mais rara para a mais comum.
function computeGlobalAchievementStats(playerStats, allRows, playerProfiles){
  const bestStreaks = computeAllBestWinStreaks(allRows);
  const names = Object.keys(playerStats);
  const counts = {};
  ACHIEVEMENTS.forEach(a=>{ counts[a.id] = 0; });
  names.forEach(name=>{
    const earned = computeAchievements(playerStats[name], bestStreaks[name] || 0);
    computeMatchPathAchievements(name, allRows, playerProfiles ? playerProfiles[name] : null).forEach(id=>earned.add(id));
    // Nota: as conquistas baseadas noutras tabelas (Apostador Fino, Golpe de
    // Sorte) ficam de fora desta % global de propósito — evita multiplicar
    // por N jogadores o número de consultas à base de dados só para uma
    // estatística de resumo.
    earned.forEach(id=>{ counts[id] = (counts[id]||0) + 1; });
  });
  return ACHIEVEMENTS.map(a=>({
    ...a,
    count: counts[a.id] || 0,
    pct: names.length ? Math.round(((counts[a.id]||0) / names.length) * 100) : 0
  })).sort((a,b)=> a.pct - b.pct);
}

const MAX_FEATURED_ACHIEVEMENTS = 6;

// Liga/desliga uma conquista em destaque no perfil (até MAX_FEATURED_ACHIEVEMENTS).
async function toggleFeaturedAchievement(supabaseUrl, supabaseAnonKey, name, achievementId, currentFeatured){
  let newFeatured;
  if(currentFeatured.includes(achievementId)){
    newFeatured = currentFeatured.filter(id=>id!==achievementId);
  } else {
    if(currentFeatured.length >= MAX_FEATURED_ACHIEVEMENTS) return {ok:false, reason:'limit'};
    newFeatured = currentFeatured.concat([achievementId]);
  }
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ featured_achievements: newFeatured })
  });
  return {ok: res.ok};
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
  await recordAllInIfApplicable(supabaseUrl, supabaseAnonKey, name, wager, rows[0].coins||0);

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
const DAILY_BONUS_AMOUNT = 5; // mantido para compatibilidade, mas o valor real agora vem de DAILY_STREAK_AMOUNTS
// Escala por dia de sequência seguida (dia 1 a 7); a partir do dia 8 repete o valor do dia 7,
// para não crescer sem limite e desequilibrar a economia.
const DAILY_STREAK_AMOUNTS = [5, 6, 8, 10, 12, 15, 20];

// Verifica se o bónus está disponível hoje, SEM o reclamar — usado para
// desenhar o ícone (aceso/apagado) antes do jogador clicar.
async function checkDailyBonusAvailable(supabaseUrl, supabaseAnonKey, name){
  if(!name) return false;
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=last_daily_bonus`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    if(!rows || !rows[0]) return false;
    const today = new Date().toISOString().slice(0,10);
    return rows[0].last_daily_bonus !== today;
  } catch(e){
    return false;
  }
}

// Ícone de presente mostrado por baixo do avatar no canto — aceso e clicável
// quando há bónus por reclamar, apagado quando já foi reclamado hoje.
function renderDailyBonusIcon(available){
  return `<button id="dailyBonusIcon" class="daily-bonus-icon${available?' available':''}"
    onclick="handleDailyBonusClick()"
    title="${available ? 'Bônus diário disponível! Clique para receber.' : 'Bônus diário já recebido hoje.'}">🎁</button>`;
}

// Devolve {awarded, amount, streak} — awarded=true só na primeira visita de cada dia.
// A sequência quebra (volta ao dia 1) se faltar um dia inteiro sem reclamar.
async function claimDailyBonus(supabaseUrl, supabaseAnonKey, name){
  if(!name) return {awarded:false};
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=last_daily_bonus,daily_streak_count,total_daily_claims,best_daily_streak`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    if(!rows || !rows[0]) return {awarded:false};
    const today = new Date().toISOString().slice(0,10);
    if(rows[0].last_daily_bonus === today) return {awarded:false};

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    const newStreak = (rows[0].last_daily_bonus === yesterday) ? ((rows[0].daily_streak_count || 0) + 1) : 1;
    const amount = DAILY_STREAK_AMOUNTS[Math.min(newStreak, DAILY_STREAK_AMOUNTS.length) - 1];
    const newTotalClaims = (rows[0].total_daily_claims || 0) + 1;
    const newBestStreak = Math.max(rows[0].best_daily_streak || 0, newStreak);

    // Escrita CONDICIONAL: só atualiza se "last_daily_bonus" continuar a ser
    // exatamente o valor que acabámos de ler. Se dois cliques (ou duas abas)
    // dispararem ao mesmo tempo, só o primeiro consegue mudar a linha — o
    // segundo não encontra nenhuma linha a corresponder e sabe que perdeu a
    // corrida, sem conceder o bónus a dobrar. Isto fecha a janela de corrida
    // que existia antes entre o "verificar" e o "gravar".
    const lastBonusFilter = rows[0].last_daily_bonus
      ? `&last_daily_bonus=eq.${rows[0].last_daily_bonus}`
      : `&last_daily_bonus=is.null`;
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}${lastBonusFilter}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=representation'}),
      body: JSON.stringify({ last_daily_bonus: today, daily_streak_count: newStreak, total_daily_claims: newTotalClaims, best_daily_streak: newBestStreak })
    });
    if(!patchRes.ok) return {awarded:false};
    const patchedRows = await patchRes.json();
    if(!patchedRows || !patchedRows.length) return {awarded:false}; // outra chamada já reclamou primeiro

    const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, amount, `Bônus diário de login (sequência: dia ${newStreak})`);
    if(!ok) return {awarded:false};
    return {awarded:true, amount, streak:newStreak};
  } catch(e){
    return {awarded:false};
  }
}

// ---------- Desconto por fidelidade ----------
// 5% de desconto na loja a cada 30 bónus diários reclamados ao longo da vida
// da conta (não precisa ser sequência contínua) — máximo de 20% (aos 120 dias).
const LOYALTY_DISCOUNT_PER_STEP_PCT = 5;
const LOYALTY_DISCOUNT_STEP_DAYS = 30;
const LOYALTY_DISCOUNT_MAX_PCT = 20;

function computeLoyaltyDiscountPct(totalClaims){
  const steps = Math.floor((totalClaims||0) / LOYALTY_DISCOUNT_STEP_DAYS);
  return Math.min(LOYALTY_DISCOUNT_MAX_PCT, steps * LOYALTY_DISCOUNT_PER_STEP_PCT);
}

function applyLoyaltyDiscount(price, discountPct){
  if(!discountPct) return price;
  return Math.max(1, Math.round(price * (1 - discountPct/100)));
}

// ---------- Celebração ao desbloquear conquista nova ----------
// Compara as conquistas já ganhas (earnedSet) com as já mostradas antes, devolve
// só as NOVAS, regista-as como já vistas para não repetir a celebração, e
// credita um bónus único de moedas por cada conquista nova.
const ACHIEVEMENT_COIN_BONUS = 15;

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
      for(const id of newOnes){
        const a = ACHIEVEMENTS.find(x=>x.id===id);
        await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, ACHIEVEMENT_COIN_BONUS, `Conquista desbloqueada: ${a?a.name:id}`);
      }
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

// ---------- Temporadas anuais ----------
// A âncora é a data do primeiro torneio já guardado — a "temporada" reinicia
// sempre que se completa mais um ano a partir dessa data (mês/dia).
function getSeasonAnchor(allRows){
  if(!allRows || !allRows.length) return null;
  const sorted = allRows.slice().sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
  return new Date(sorted[0].created_at);
}

const SEASON_LENGTH_MONTHS = 3;

function computeSeasonNumber(dateStr, anchorDate){
  if(!anchorDate) return 1;
  const d = new Date(dateStr);
  let monthsDiff = (d.getFullYear() - anchorDate.getFullYear()) * 12 + (d.getMonth() - anchorDate.getMonth());
  if(d.getDate() < anchorDate.getDate()) monthsDiff -= 1;
  const seasonIndex = Math.floor(monthsDiff / SEASON_LENGTH_MONTHS);
  return seasonIndex + 1; // Temporada 1, 2, 3...
}

function getCurrentSeasonNumber(allRows){
  const anchor = getSeasonAnchor(allRows);
  if(!anchor) return 1;
  return computeSeasonNumber(new Date().toISOString(), anchor);
}

function filterRowsBySeason(allRows, seasonNumber){
  const anchor = getSeasonAnchor(allRows);
  return allRows.filter(r => computeSeasonNumber(r.created_at, anchor) === seasonNumber);
}

// ---------- MVP automático a cada 3 torneios (usado como proxy de "por mês") ----------
// Agrupa os torneios concluídos em blocos de 3 (por ordem cronológica) e
// escolhe o MVP de cada bloco: mais vitórias nesses 3 torneios, com o
// winrate nesse bloco como desempate.
function computeMvpBatches(rows){
  const concluded = rows.filter(r => r.data && r.data.champion).slice().sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));
  const batches = [];
  for(let i=0; i+3<=concluded.length; i+=3){
    const batchRows = concluded.slice(i, i+3);
    const stats = aggregatePlayers(batchRows);
    let mvp = null;
    Object.entries(stats).forEach(([name, s])=>{
      const total = s.wins + s.losses;
      const winrate = total ? s.wins/total : 0;
      if(!mvp || s.wins > mvp.wins || (s.wins === mvp.wins && winrate > mvp.winrate)){
        mvp = { name, wins: s.wins, losses: s.losses, winrate };
      }
    });
    batches.push({
      batchNumber: batches.length + 1,
      tournamentNames: batchRows.map(r => (r.data.name || `Torneio ${r.tier||''}`)),
      startDate: batchRows[0].created_at,
      endDate: batchRows[batchRows.length-1].created_at,
      mvp
    });
  }
  return batches.reverse(); // mais recente primeiro
}

// ---------- Apelidos de Pokémon (extraídos do formato "Apelido (Espécie)") ----------
// Devolve uma lista de {species, nickname, playerName, tournamentName, tournamentId, date}
// para cada Pokémon com apelido já importado em qualquer torneio.
function aggregateNicknames(rows){
  const results = [];
  rows.forEach(r=>{
    const data = r.data || {};
    const players = data.players || [];
    Object.entries(data.draws || {}).forEach(([pIdxStr, entry])=>{
      const pIdx = parseInt(pIdxStr, 10);
      const playerName = players[pIdx];
      if(!playerName) return;
      const items = [...(entry.random||[]), ...(entry.free||[])];
      items.forEach(item=>{
        if(!item || !item.text) return;
        const parsed = parseShowdownImport(item.text);
        if(parsed && parsed.nickname && parsed.name){
          results.push({
            species: parsed.name,
            nickname: parsed.nickname,
            playerName,
            tournamentName: data.name || `Torneio ${r.tier||''}`,
            tournamentId: r.id || null,
            date: r.created_at
          });
        }
      });
    });
  });
  return results;
}

// ---------- Votação do "Apelido da Semana" ----------
const NICKNAME_VOTE_PRIZE = 30;

async function fetchMyNicknameVote(supabaseUrl, supabaseAnonKey, tournamentId, voterName){
  const res = await fetch(`${supabaseUrl}/rest/v1/nickname_votes?tournament_id=eq.${tournamentId}&voter_name=eq.${encodeURIComponent(voterName)}&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return null;
  const rows = await res.json();
  return (rows && rows[0]) ? rows[0] : null;
}

// Devolve {ok, reason} — 'error' | true. Um voto por jogador por torneio (upsert).
async function castNicknameVote(supabaseUrl, supabaseAnonKey, tournamentId, voterName, ownerName, nickname, species){
  const existing = await fetchMyNicknameVote(supabaseUrl, supabaseAnonKey, tournamentId, voterName);
  try{
    if(existing){
      const res = await fetch(`${supabaseUrl}/rest/v1/nickname_votes?id=eq.${existing.id}`, {
        method:'PATCH',
        headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
        body: JSON.stringify({ owner_name: ownerName, nickname, species })
      });
      return {ok: res.ok};
    }
    const res = await fetch(`${supabaseUrl}/rest/v1/nickname_votes`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify([{ tournament_id: tournamentId, voter_name: voterName, owner_name: ownerName, nickname, species }])
    });
    return {ok: res.ok};
  } catch(e){
    return {ok:false, reason:'error'};
  }
}

async function fetchNicknameVoteStandings(supabaseUrl, supabaseAnonKey, tournamentId){
  const res = await fetch(`${supabaseUrl}/rest/v1/nickname_votes?tournament_id=eq.${tournamentId}&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return [];
  const rows = await res.json();
  const tally = {};
  const ownerTotals = {};
  rows.forEach(r=>{
    const key = `${r.owner_name}|${r.nickname}|${r.species}`;
    if(!tally[key]) tally[key] = { ownerName:r.owner_name, nickname:r.nickname, species:r.species, votes:0 };
    tally[key].votes++;
    ownerTotals[r.owner_name] = (ownerTotals[r.owner_name]||0) + 1;
  });
  // ownerTotal: soma de TODOS os apelidos desse dono — é isto que decide o
  // vencedor no apuramento (ver resolveNicknameVoteWinner no gestor), mesmo
  // quando o "votes" individual de um apelido é menor que o de outro dono.
  return Object.values(tally)
    .map(entry => ({ ...entry, ownerTotal: ownerTotals[entry.ownerName] }))
    .sort((a,b)=> (b.ownerTotal - a.ownerTotal) || (b.votes - a.votes));
}

// ---------- Comparador de Temporadas ----------
// Devolve um array com uma linha por temporada já existente: vitórias,
// derrotas, títulos, e o Elo médio registado nessa temporada.
function computeSeasonComparison(allRows, name){
  const anchor = getSeasonAnchor(allRows);
  if(!anchor) return [];
  const maxSeason = Math.max(1, ...allRows.map(r => computeSeasonNumber(r.created_at, anchor)));
  const eloHistory = computeEloHistory(allRows, name);
  const seasons = [];
  for(let s=1; s<=maxSeason; s++){
    const seasonRows = filterRowsBySeason(allRows, s);
    const stats = aggregatePlayers(seasonRows)[name] || {wins:0, losses:0, titles:0, tournaments:[]};
    const seasonEloPoints = eloHistory.filter(p => computeSeasonNumber(p.date, anchor) === s);
    const avgElo = seasonEloPoints.length ? Math.round(seasonEloPoints.reduce((a,p)=>a+p.rating,0)/seasonEloPoints.length) : null;
    seasons.push({
      season: s, wins: stats.wins, losses: stats.losses, titles: stats.titles,
      avgElo, tournamentsPlayed: stats.tournaments.length
    });
  }
  return seasons;
}

// ---------- Winrate por tier, por jogador ----------
function computeWinrateByTier(allRows, name){
  const byTier = {};
  allRows.forEach(r=>{
    const data = r.data || {};
    const tier = data.tier || r.tier;
    if(!tier) return;
    const matches = data.matches || [];
    matches.forEach(m=>{
      if(!m.winner || (m.p1!==name && m.p2!==name)) return;
      if(!byTier[tier]) byTier[tier] = {wins:0, losses:0};
      if(m.winner === name) byTier[tier].wins++;
      else byTier[tier].losses++;
    });
  });
  return Object.entries(byTier).map(([tier, rec])=>{
    const total = rec.wins + rec.losses;
    return { tier, wins: rec.wins, losses: rec.losses, total, winrate: total ? Math.round((rec.wins/total)*100) : 0 };
  }).sort((a,b)=> b.winrate - a.winrate);
}

// ---------- Equipa Icônica ----------
// Os 6 Pokémon mais usados por um jogador ao longo de toda a história —
// a "assinatura" do seu estilo de jogo.
function computeIconicTeam(allRows, name){
  const { mons } = aggregatePlayerPokemon(allRows, name);
  return Object.entries(mons).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([species,count])=>({species,count}));
}

// ---------- Loja Rotativa: item em destaque com desconto, muda toda a semana ----------
const WEEKLY_FEATURED_DISCOUNT_PCT = 30;

// Determinístico — a mesma semana calendário dá sempre o mesmo item para
// toda a gente, sem precisar de nenhuma tabela nova na base de dados.
function getWeeklyFeaturedItem(){
  const allPurchasable = [];
  ['backgrounds','accents','frames','nameEffects','titles','badges'].forEach(cat=>{
    (COSMETIC_CATALOG[cat]||[]).forEach(item=>{
      if(item.price > 0) allPurchasable.push(Object.assign({category:cat}, item));
    });
  });
  if(!allPurchasable.length) return null;
  const weekNumber = Math.floor(Date.now() / (7*24*60*60*1000));
  const item = allPurchasable[weekNumber % allPurchasable.length];
  const discountedPrice = Math.max(1, Math.round(item.price * (1 - WEEKLY_FEATURED_DISCOUNT_PCT/100)));
  return Object.assign({}, item, { discountedPrice, discountPct: WEEKLY_FEATURED_DISCOUNT_PCT });
}

// Compra o item em destaque da semana, usando o preço com desconto.
// Devolve {ok, reason} — 'insufficient' | 'alreadyowned' | 'error' | true.
async function buyFeaturedItem(supabaseUrl, supabaseAnonKey, name, item){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins,owned_cosmetics`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  const current = rows[0];
  const owned = current.owned_cosmetics || [];
  if(owned.includes(item.id)) return {ok:false, reason:'alreadyowned'};
  if((current.coins||0) < item.discountedPrice) return {ok:false, reason:'insufficient'};

  const newCoins = (current.coins||0) - item.discountedPrice;
  const newOwned = owned.concat([item.id]);
  const patchRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ coins: newCoins, owned_cosmetics: newOwned })
  });
  if(patchRes.ok){
    await logCoinTransaction(supabaseUrl, supabaseAnonKey, name, -item.discountedPrice, `Comprou "${item.name}" na Loja Rotativa (${WEEKLY_FEATURED_DISCOUNT_PCT}% de desconto)`);
  }
  return {ok: patchRes.ok};
}

// ---------- Leilão de item raro ----------
const AUCTION_DURATION_DAYS = 3;
// Itens marcados como auctionOnly no catálogo — nunca à venda direta, só aqui.
const AUCTIONABLE_ITEMS = ['frame_diamond', 'title_auction_legend'];

function getCosmeticCategory(itemId){
  for(const cat of Object.keys(COSMETIC_CATALOG)){
    if(COSMETIC_CATALOG[cat].some(i=>i.id===itemId)) return cat;
  }
  return null;
}

async function fetchActiveAuction(supabaseUrl, supabaseAnonKey){
  const res = await fetch(`${supabaseUrl}/rest/v1/auctions?status=eq.active&order=created_at.desc&limit=1&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return null;
  const rows = await res.json();
  return (rows && rows[0]) ? rows[0] : null;
}

async function fetchAuctionBids(supabaseUrl, supabaseAnonKey, auctionId){
  const res = await fetch(`${supabaseUrl}/rest/v1/auction_bids?auction_id=eq.${auctionId}&order=amount.desc&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return [];
  return await res.json();
}

async function fetchPastAuctions(supabaseUrl, supabaseAnonKey, limit){
  const res = await fetch(`${supabaseUrl}/rest/v1/auctions?status=eq.concluded&order=created_at.desc&limit=${limit||10}&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
  if(!res.ok) return [];
  return await res.json();
}

// Devolve {ok, reason} — 'invalid' | 'insufficient' | 'toolow' | 'ended' | 'error' | true
async function placeBid(supabaseUrl, supabaseAnonKey, auctionId, bidderName, amount){
  if(!amount || amount <= 0) return {ok:false, reason:'invalid'};
  const auctionRes = await fetch(`${supabaseUrl}/rest/v1/auctions?id=eq.${auctionId}&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const auctionRows = await auctionRes.json();
  if(!auctionRows || !auctionRows[0]) return {ok:false, reason:'error'};
  const auction = auctionRows[0];
  if(auction.status !== 'active' || new Date(auction.ends_at) < new Date()) return {ok:false, reason:'ended'};

  const bids = await fetchAuctionBids(supabaseUrl, supabaseAnonKey, auctionId);
  const highest = bids.length ? bids[0].amount : 0;
  if(amount <= highest) return {ok:false, reason:'toolow'};

  const playerRes = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(bidderName)}&select=coins`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const playerRows = await playerRes.json();
  if(!playerRows || !playerRows[0]) return {ok:false, reason:'error'};
  if((playerRows[0].coins||0) < amount) return {ok:false, reason:'insufficient'};

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/auction_bids`, {
    method:'POST',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify([{ auction_id: auctionId, bidder_name: bidderName, amount }])
  });
  return {ok: insertRes.ok};
}

// ---------- Loteria ----------
// Bilhete barato e de preço fixo (sempre acessível). Cada bilhete recebe um
// número aleatório; no sorteio, um número vencedor é escolhido e só ganha
// quem tiver algum bilhete com esse número exato. Na maioria das vezes
// ninguém acerta, e o pote acumula para a rodada seguinte (o sorteio em si
// corre no gestor, ver LOTTERY_NUMBER_RANGE lá, que tem de ser o mesmo valor).
const LOTTERY_TICKET_PRICE = 10;
const LOTTERY_HOUSE_CUT_PCT = 10; // fica de fora do pote, funciona como dreno da economia
const LOTTERY_NUMBER_RANGE = 50;
const LOTTERY_POT_BASE = 30; // toda rodada NOVA (não acumulada) começa com este valor de brinde

async function fetchActiveLotteryRound(supabaseUrl, supabaseAnonKey){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/lottery_rounds?status=eq.active&order=created_at.desc&limit=1&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    if(rows && rows[0]) return rows[0];
    // Nenhuma rodada ativa — cria uma nova automaticamente, já com o valor base.
    const createRes = await fetch(`${supabaseUrl}/rest/v1/lottery_rounds`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=representation'}),
      body: JSON.stringify([{ status:'active', pot: LOTTERY_POT_BASE, total_tickets:0 }])
    });
    if(!createRes.ok) return null;
    const createdRows = await createRes.json();
    return (createdRows && createdRows[0]) ? createdRows[0] : null;
  } catch(e){
    return null;
  }
}

async function fetchMyLotteryTickets(supabaseUrl, supabaseAnonKey, roundId, name){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/lottery_tickets?round_id=eq.${roundId}&buyer_name=eq.${encodeURIComponent(name)}&select=ticket_count`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    return rows.reduce((s,r)=>s+(r.ticket_count||0), 0);
  } catch(e){
    return 0;
  }
}

// Devolve {ok, reason} — 'insufficient' | 'invalid' | 'error' | true
async function buyLotteryTickets(supabaseUrl, supabaseAnonKey, name, roundId, count){
  if(!count || count <= 0) return {ok:false, reason:'invalid'};
  const cost = count * LOTTERY_TICKET_PRICE;
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'error'};
  if((rows[0].coins||0) < cost) return {ok:false, reason:'insufficient'};

  const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, -cost, `Comprou ${count} bilhete(s) da Loteria`);
  if(!ok) return {ok:false, reason:'error'};

  const insertRes = await fetch(`${supabaseUrl}/rest/v1/lottery_tickets`, {
    method:'POST',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify([{ round_id: roundId, buyer_name: name, ticket_count: count }])
  });
  if(!insertRes.ok) return {ok:false, reason:'error'};

  try{
    const roundRes = await fetch(`${supabaseUrl}/rest/v1/lottery_rounds?id=eq.${roundId}&select=pot,total_tickets`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const roundRows = await roundRes.json();
    if(roundRows && roundRows[0]){
      const potIncrease = Math.round(cost * (1 - LOTTERY_HOUSE_CUT_PCT/100));
      await fetch(`${supabaseUrl}/rest/v1/lottery_rounds?id=eq.${roundId}`, {
        method:'PATCH',
        headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
        body: JSON.stringify({ pot: (roundRows[0].pot||0) + potIncrease, total_tickets: (roundRows[0].total_tickets||0) + count })
      });
    }
  } catch(e){ /* nao critico */ }

  return {ok:true};
}

async function fetchLotteryTicketHolders(supabaseUrl, supabaseAnonKey, roundId){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/lottery_tickets?round_id=eq.${roundId}&select=buyer_name,ticket_count`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    const tally = {};
    rows.forEach(r=>{ tally[r.buyer_name] = (tally[r.buyer_name]||0) + (r.ticket_count||0); });
    return Object.entries(tally).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
  } catch(e){
    return [];
  }
}

async function fetchPastLotteryRounds(supabaseUrl, supabaseAnonKey, limit){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/lottery_rounds?status=eq.concluded&order=created_at.desc&limit=${limit||10}&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
    return await res.json();
  } catch(e){
    return [];
  }
}

// ---------- Vault de Sets Favoritos ----------
// Deixa cada jogador marcar sets já importados para encontrar rapidamente
// depois, sem precisar de procurar no histórico de torneios antigos.
async function fetchFavoriteSets(supabaseUrl, supabaseAnonKey, playerName){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/favorite_sets?player_name=eq.${encodeURIComponent(playerName)}&select=*&order=created_at.desc`, {headers: sbAuthHeaders(supabaseAnonKey)});
    if(!res.ok) return [];
    return await res.json();
  } catch(e){
    return [];
  }
}

// Devolve {ok, reason} — 'duplicate' | 'error' | true
async function addFavoriteSet(supabaseUrl, supabaseAnonKey, playerName, species, nickname, setText, tournamentName){
  try{
    // Evita duplicar exatamente o mesmo set já favoritado.
    const existing = await fetchFavoriteSets(supabaseUrl, supabaseAnonKey, playerName);
    if(existing.some(f => f.set_text === setText)) return {ok:false, reason:'duplicate'};

    const res = await fetch(`${supabaseUrl}/rest/v1/favorite_sets`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify([{ player_name: playerName, species, nickname: nickname || null, set_text: setText, tournament_name: tournamentName || null }])
    });
    return {ok: res.ok};
  } catch(e){
    return {ok:false, reason:'error'};
  }
}

async function removeFavoriteSet(supabaseUrl, supabaseAnonKey, id){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/favorite_sets?id=eq.${id}`, {
      method:'DELETE', headers: sbAuthHeaders(supabaseAnonKey)
    });
    return {ok: res.ok};
  } catch(e){
    return {ok:false};
  }
}

// ---------- Tags Especiais (atribuídas manualmente pelo organizador) ----------
// Diferente dos títulos da loja (compráveis, um só de cada vez): estas tags
// são atribuídas à mão pelo organizador no gestor, um jogador pode ter
// várias ao mesmo tempo, e servem para reconhecimentos pontuais que os
// números não captam (ex: encontrou um bug, ajudou a testar, é o criador).
async function fetchPlayerSpecialTags(supabaseUrl, supabaseAnonKey, name){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=special_tags`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    return (rows && rows[0] && rows[0].special_tags) || [];
  } catch(e){
    return [];
  }
}

async function addSpecialTag(supabaseUrl, supabaseAnonKey, name, emoji, text){
  try{
    const current = await fetchPlayerSpecialTags(supabaseUrl, supabaseAnonKey, name);
    const updated = current.concat([{ emoji: emoji || '🏷️', text }]);
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({ special_tags: updated })
    });
    return {ok: res.ok};
  } catch(e){
    return {ok:false};
  }
}

async function removeSpecialTag(supabaseUrl, supabaseAnonKey, name, index){
  try{
    const current = await fetchPlayerSpecialTags(supabaseUrl, supabaseAnonKey, name);
    const updated = current.filter((_, i) => i !== index);
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({ special_tags: updated })
    });
    return {ok: res.ok};
  } catch(e){
    return {ok:false};
  }
}
