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

// Recebe o export de um time inteiro do Showdown (vários Pokémon
// separados por linha em branco) e devolve uma lista de
// { raw, parsed } — um por bloco não vazio, reaproveitando
// parseShowdownImport() para cada um. Não valida nada sobre o torneio
// (a quem cada Pokémon pertence, etc.) — isso é responsabilidade de
// quem chama, ver importWholeTeam() em viewer.html.
function parseShowdownTeamImport(text){
  return text.split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(block => block.length > 0)
    .map(raw => ({ raw, parsed: parseShowdownImport(raw) }))
    .filter(entry => entry.parsed && entry.parsed.name);
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
        // Numa derrota com repescagem (m.loserNext definido), o jogador cai
        // para a chave de perdedores em vez de ficar eliminado — só conta
        // como eliminação uma derrota sem "próxima paragem" (loserNext).
        const lostMatch = matches.find(m=>m.winner && (m.p1===p || m.p2===p) && m.winner!==p && !m.loserNext);
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

// Repete `fn` a cada `ms` milissegundos, para as páginas atualizarem
// sozinhas sem precisar de F5. Pausa enquanto a aba não está visível
// (em segundo plano), para não gastar pedidos à toa.
function startPolling(fn, ms){
  setInterval(() => { if(!document.hidden) fn(); }, ms);
}

function sbAuthHeaders(supabaseAnonKey){
  return { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` };
}

// ---------- Sprites dos Pokémon (imagens do próprio Showdown) ----------
// Sprites "gen5" (pixel art 96x96, ~1 KB cada) servidos pelo Showdown: cobrem 532/532 dos Pokémon que o projeto usa (estudo e decisão em
// docs/PROPOSTA_SPRITES.txt). Se a imagem não existir ou não carregar, esconde-se sozinha e fica só o texto. O id só tem [a-z0-9-], por isso é
// seguro em atributos HTML. Usar tamanhos que dividam 96 (48, 32) para o pixel art não ficar esborratado.
const POKE_SPRITE_BASE = 'https://play.pokemonshowdown.com/sprites/gen5/';
const POKE_NOMES_COM_HIFEN = new Set(['Porygon-Z', 'Ho-Oh', 'Jangmo-o', 'Hakamo-o', 'Kommo-o', 'Chi-Yu', 'Ting-Lu', 'Wo-Chien', 'Chien-Pao']);
// "Tauros-Paldea-Blaze" -> "tauros-paldeablaze"; "Oricorio-Pa'u" -> "oricorio-pau"; "Ho-Oh" -> "hooh"; "Mr. Mime" -> "mrmime"
function pokeSpriteId(name){
  const toId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = String(name || '').trim();
  if(!n) return '';
  if(POKE_NOMES_COM_HIFEN.has(n)) return toId(n);
  const i = n.indexOf('-');
  return i === -1 ? toId(n) : (toId(n.slice(0, i)) + '-' + toId(n.slice(i + 1)));
}
function pokeSpriteHtml(name, size){
  const id = pokeSpriteId(name);
  if(!id) return '';
  const px = size || 48;
  return `<img class="poke-sprite" src="${POKE_SPRITE_BASE}${id}.png" width="${px}" height="${px}" loading="lazy" decoding="async" alt="" onerror="this.style.visibility='hidden'">`;
}

// Chama uma função da base de dados (RPC). Nunca lança: devolve {ok, status, data} (data = JSON da resposta, ou null).
// As moedas, as compras e as conquistas passam todas por funções SQL "atómicas" (ver o SQL mestre, schema_version 4):
// a base de dados bloqueia a linha do jogador, confere e escreve tudo de uma vez — acabaram as moedas perdidas por corridas.
async function dbFunction(supabaseUrl, supabaseAnonKey, fn, args){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json'}),
      body: JSON.stringify(args || {})
    });
    let data = null;
    try{ data = await res.json(); } catch(e){ /* resposta vazia */ }
    if(res.status === 404) console.error(`A função ${fn} não existe na base de dados — corre primeiro o SQL mestre atualizado.`);
    return { ok: res.ok, status: res.status, data };
  } catch(e){
    return { ok:false, status:0, data:null };
  }
}

// ---------- Sessão de login ("bilhete") ----------
// Ao entrar com a password, a base de dados (função login_player) devolve um bilhete aleatório, válido 60 dias. Fica guardado neste browser
// (player_token + player_token_name) e é enviado em tudo o que GASTA ou MOVE moedas (adjust_coins negativo, transfer_coins, buy_cosmetic_item):
// a base só deixa gastar as moedas de um jogador a quem prova que é esse jogador (quando o interruptor security_flags.require_session está ligado).
function getPlayerToken(name){
  try{
    if(!name || localStorage.getItem('player_token_name') !== name) return null;
    return localStorage.getItem('player_token') || null;
  } catch(e){ return null; }
}
function storePlayerToken(name, token){
  try{ localStorage.setItem('player_token_name', name); localStorage.setItem('player_token', token || ''); } catch(e){ /* sem armazenamento */ }
}
// "Trocar jogador": esquece o bilhete aqui e apaga-o também na base de dados.
function endPlayerSession(supabaseUrl, supabaseAnonKey){
  let token = null;
  try{
    token = localStorage.getItem('player_token');
    localStorage.removeItem('player_token'); localStorage.removeItem('player_token_name');
  } catch(e){ /* sem armazenamento */ }
  if(token) dbFunction(supabaseUrl, supabaseAnonKey, 'logout_player', { p_token: token });
}
// A base recusou por falta de bilhete válido (expirou, ou a password foi mudada): pede para entrar outra vez.
let _sessionExpiredShown = false;
function handleSessionExpired(){
  if(_sessionExpiredShown) return;
  _sessionExpiredShown = true;
  try{ ['player_login_name','player_token','player_token_name'].forEach(k=>localStorage.removeItem(k)); } catch(e){ /* sem armazenamento */ }
  alert('A tua sessão expirou. Vais ter de entrar outra vez com a tua password.');
  location.reload();
}
// Quem já estava "entrado" só com o nome (antes dos bilhetes) tem de entrar uma vez com a password para receber o seu bilhete.
(function purgeLoginsSemBilhete(){
  try{
    const n = localStorage.getItem('player_login_name');
    if(n && localStorage.getItem('player_token_name') !== n) localStorage.removeItem('player_login_name');
  } catch(e){ /* sem armazenamento */ }
})();

// Devolve {ok:true} ou {ok:false, reason:'notfound'|'wrongpass'|'network'}
// O login é decidido DENTRO da base de dados (função login_player, ver o SQL mestre): as passwords ficam guardadas
// como hash (bcrypt) numa tabela que a chave pública não consegue ler, por isso o browser nunca as vê. Em caso de sucesso a base devolve o bilhete.
// Se a função ainda não existir (SQL por correr -> 404) usa o método sem bilhete, para ninguém ficar de fora.
async function verifyPlayerLogin(supabaseUrl, supabaseAnonKey, name, password){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/login_player`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json'}),
      body: JSON.stringify({ p_name: name, p_password: password })
    });
    if(res.status === 404){
      const old = await verifyPlayerLoginNoSession(supabaseUrl, supabaseAnonKey, name, password);
      if(old.ok) storePlayerToken(name, '');
      return old;
    }
    if(!res.ok) return {ok:false, reason:'network'};
    const r = await res.json();
    if(r && r.status === 'ok' && r.token){ storePlayerToken(name, r.token); return {ok:true}; }
    if(r && r.status === 'notfound') return {ok:false, reason:'notfound'};
    return {ok:false, reason:'wrongpass'};
  } catch(e){
    return {ok:false, reason:'network'};
  }
}
// Método sem bilhete (check_login, e em último caso a leitura antiga da password): só como reserva enquanto login_player não existe.
async function verifyPlayerLoginNoSession(supabaseUrl, supabaseAnonKey, name, password){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/check_login`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json'}),
      body: JSON.stringify({ p_name: name, p_password: password })
    });
    if(res.status === 404) return await verifyPlayerLoginLegacy(supabaseUrl, supabaseAnonKey, name, password);
    if(!res.ok) return {ok:false, reason:'network'};
    const r = await res.json();
    if(r === 'ok') return {ok:true};
    if(r === 'notfound') return {ok:false, reason:'notfound'};
    return {ok:false, reason:'wrongpass'};
  } catch(e){
    return {ok:false, reason:'network'};
  }
}
// Método antigo (password em texto simples em players.password_hash): só como reserva enquanto a função não existe.
async function verifyPlayerLoginLegacy(supabaseUrl, supabaseAnonKey, name, password){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=password_hash`, {
      headers: sbAuthHeaders(supabaseAnonKey)
    });
    if(!res.ok) return {ok:false, reason:'network'};
    const rows = await res.json();
    if(!rows || !rows[0]) return {ok:false, reason:'notfound'};
    if(!rows[0].password_hash || password !== rows[0].password_hash) return {ok:false, reason:'wrongpass'};
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
  const res = await fetch(`${supabaseUrl}/rest/v1/players?select=name,nickname,photo_url,status_message,coins,owned_cosmetics,equipped_background,equipped_accent,equipped_frame,equipped_name_effect,equipped_title,equipped_badges,profile_background_url,site_background_url,guaranteed_bye,elo_chart_unlocked,featured_achievements,total_daily_claims,special_tags,birthday_month,birthday_day`, {headers: sbAuthHeaders(supabaseAnonKey)});
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
      profileBackgroundUrl: r.profile_background_url || null, siteBackgroundUrl: r.site_background_url || null,
      guaranteedBye: !!r.guaranteed_bye,
      eloChartUnlocked: !!r.elo_chart_unlocked, featuredAchievements: r.featured_achievements || [],
      totalDailyClaims: r.total_daily_claims || 0, loyaltyDiscountPct: computeLoyaltyDiscountPct(r.total_daily_claims),
      specialTags: r.special_tags || [], birthdayMonth: r.birthday_month || null, birthdayDay: r.birthday_day || null
    };
  });
  return map;
}

async function updatePlayerProfile(supabaseUrl, supabaseAnonKey, name, nickname, photoUrl, statusMessage, birthdayMonth, birthdayDay){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ nickname: nickname || null, photo_url: photoUrl || null, status_message: statusMessage || null, birthday_month: birthdayMonth || null, birthday_day: birthdayDay || null })
  });
  return res.ok;
}

// ---------- Loja de personalização ----------
const COSMETIC_CATALOG = {
  // "Cor da moldura" (antes "Fundo do Avatar"; ids bg_* e campo equipped_background mantêm-se) é a COR usada pelo
  // efeito animado equipado na Moldura (ver frames abaixo). O campo "css"
  // fica só para a pré-visualização na loja (mostra o gradiente do tema).
  backgrounds: [
    { id:'bg_default',  name:'Padrão',       price:0,   css:'linear-gradient(135deg,#a56bf0,#4fd8d0)', color:'#a56bf0' },
    { id:'bg_sunset',   name:'Pôr do Sol',   price:50,  css:'linear-gradient(135deg,#f0b64f,#e0607a)', color:'#f0b64f' },
    { id:'bg_ocean',    name:'Oceano',       price:50,  css:'linear-gradient(135deg,#0e9488,#4fd8d0)', color:'#4fd8d0' },
    { id:'bg_galaxy',   name:'Galáxia',      price:80,  css:'linear-gradient(135deg,#7c4dc4,#1a1d29)', color:'#7c4dc4' },
    { id:'bg_fire',     name:'Fogo',         price:80,  css:'linear-gradient(135deg,#e0607a,#f0b64f)', color:'#e0607a' },
    { id:'bg_gold',     name:'Ouro Puro',    price:150, css:'linear-gradient(135deg,#f0b64f,#b8860b)', color:'#f0b64f' },
    { id:'bg_aurora',   name:'Aurora Animada', price:220, css:'linear-gradient(270deg,#4fd8d0,#a56bf0,#f0b64f,#4fd8d0)', color:'#a56bf0', multiColor:['#4fd8d0','#a56bf0','#f0b64f'] },
    // Itens de EVENTO (eventOnly): price 0, nunca à venda — só se ganham ao subir de nível no evento.
    { id:'bg_vm_ceu',   name:'Céu de Viagem', price:0, css:'linear-gradient(135deg,#4fa8f0,#f0b64f)', color:'#4fa8f0', eventOnly:'volta-ao-mundo' },
    { id:'bg_vm_porsol', name:'Pôr do Sol Mundial', price:0, css:'linear-gradient(270deg,#f0b64f,#e0607a,#a56bf0,#f0b64f)', color:'#e0607a', multiColor:['#f0b64f','#e0607a','#a56bf0'], eventOnly:'volta-ao-mundo' },
    // Lembranças da LOJA DE MILHAS do evento (também eventOnly, price 0): o preço em Milhas vive na base de dados (tabela event_shop_items).
    { id:'bg_vm_kanto',  name:'Neon de Kanto',    price:0, css:'linear-gradient(135deg,#ff4fa3,#5b3df0)', color:'#ff4fa3', eventOnly:'volta-ao-mundo' },
    { id:'bg_vm_johto',  name:'Dourado de Johto', price:0, css:'linear-gradient(135deg,#f0d36b,#c98a2b)', color:'#f0d36b', eventOnly:'volta-ao-mundo' },
    { id:'bg_vm_hoenn',  name:'Vulcão de Hoenn',  price:0, css:'linear-gradient(135deg,#ff7a3d,#8f1d1d)', color:'#ff7a3d', eventOnly:'volta-ao-mundo' },
    { id:'bg_vm_sinnoh', name:'Neve de Sinnoh',   price:0, css:'linear-gradient(135deg,#d7ecff,#6fa8e8)', color:'#9fd0ff', eventOnly:'volta-ao-mundo' }
  ],
  accents: [
    { id:'accent_default', name:'Ciano (padrão)', price:0,  color:'#4fd8d0' },
    { id:'accent_violet',  name:'Violeta',        price:30, color:'#a56bf0' },
    { id:'accent_amber',   name:'Âmbar',          price:30, color:'#f0b64f' },
    { id:'accent_rose',    name:'Rosa',           price:30, color:'#e0607a' },
    { id:'accent_emerald', name:'Esmeralda',      price:50, color:'#5ed890' },
    // Lembranças da loja de Milhas (ver backgrounds).
    { id:'accent_vm_ceu',   name:'Azul-Céu',     price:0, color:'#4fa8f0', eventOnly:'volta-ao-mundo' },
    { id:'accent_vm_pista', name:'Luz de Pista', price:0, color:'#ffb347', eventOnly:'volta-ao-mundo' }
  ],
  // "Moldura do Avatar" já não é uma borda estática — agora é um EFEITO
  // ANIMADO à volta do avatar, colorido com a cor escolhida em "Cor da
  // moldura" (ver backgrounds acima). Os IDs mantêm-se os mesmos de antes
  // para quem já os tinha comprado não perder nada.
  frames: [
    { id:'frame_none',  name:'Sem moldura',   price:0,   effect:'none' },
    { id:'frame_gold',  name:'Faíscas',       price:60,  effect:'sparks' },
    { id:'frame_neon',  name:'Estrelado',     price:60,  effect:'starry' },
    { id:'frame_royal', name:'Florescer',     price:100, effect:'blossom' },
    { id:'frame_diamond', name:'Diamante Prismático', price:0, effect:'diamond', auctionOnly:true },
    { id:'frame_vm_rota', name:'Rota Aérea', price:0, effect:'plane', eventOnly:'volta-ao-mundo' },
    { id:'frame_vm_esquadrilha', name:'Esquadrilha', price:0, effect:'fleet', eventOnly:'volta-ao-mundo' },
    // Lembrança PREMIUM da loja de Milhas (ver event_shop_items): balão de ar quente a dar a volta ao avatar.
    { id:'frame_vm_balao', name:'Balão de Ar Quente', price:0, effect:'balloon', eventOnly:'volta-ao-mundo' }
  ],
  nameEffects: [
    { id:'effect_none',  name:'Nenhum',  price:0,  css:'' },
    // `fx` = identidade visual (classe .name-fx-<fx>, definida em ensureNameFxStyles); `css` ficou vazio de propósito
    // (antes eram strings de CSS inline, o que fazia o "Pulsar" não animar fora do perfil e os efeitos parecerem iguais).
    { id:'effect_glow',  name:'Brilho',  price:70, fx:'glow', css:'' },
    { id:'effect_pulse', name:'Pulsar',  price:90, fx:'pulse', css:'' },
    { id:'effect_vm_rasto', name:'Rasto de Avião', price:0, fx:'contrail', css:'', eventOnly:'volta-ao-mundo' },
    { id:'effect_vm_aurora', name:'Aurora de Cabine', price:0, fx:'aurora', css:'', eventOnly:'volta-ao-mundo' }
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
    { id:'title_auction_legend', name:'Lenda do Leilão',   price:0, text:'💠 Lenda do Leilão', auctionOnly:true },
    { id:'title_vm_mochileiro', name:'Mochileiro', price:0, text:'🧳 Mochileiro', eventOnly:'volta-ao-mundo' },
    { id:'title_vm_piloto', name:'Piloto de Linha', price:0, text:'🛩️ Piloto de Linha', eventOnly:'volta-ao-mundo' },
    { id:'title_vm_campeao_kanto',  name:'Campeão de Kanto',  price:0, text:'🗼 Campeão de Kanto',  eventOnly:'volta-ao-mundo' },
    { id:'title_vm_campeao_johto',  name:'Campeão de Johto',  price:0, text:'🔔 Campeão de Johto',  eventOnly:'volta-ao-mundo' },
    { id:'title_vm_campeao_hoenn',  name:'Campeão de Hoenn',  price:0, text:'🌋 Campeão de Hoenn',  eventOnly:'volta-ao-mundo' },
    { id:'title_vm_campeao_sinnoh', name:'Campeão de Sinnoh', price:0, text:'❄️ Campeão de Sinnoh', eventOnly:'volta-ao-mundo' },
    // Lembranças da loja de Milhas (ver backgrounds).
    { id:'title_vm_turista',    name:'Turista Profissional', price:0, text:'🗺️ Turista Profissional', eventOnly:'volta-ao-mundo' },
    { id:'title_vm_carimbos',   name:'Caçador de Carimbos',  price:0, text:'🛂 Caçador de Carimbos',  eventOnly:'volta-ao-mundo' },
    { id:'title_vm_comissario', name:'Chefe de Cabine',      price:0, text:'🧑‍✈️ Chefe de Cabine',   eventOnly:'volta-ao-mundo' },
    { id:'title_vm_primeira',   name:'Primeira Classe',      price:0, text:'🥂 Primeira Classe',      eventOnly:'volta-ao-mundo' },
    // Atribuído pelo organizador (gestor) a quem tiver mais vitórias em x1 no evento; não está à venda em lado nenhum.
    { id:'title_vm_rei_duelos', name:'Rei dos Duelos',       price:0, text:'👑 Rei dos Duelos',       eventOnly:'volta-ao-mundo' }
  ],
  badges: [
    { id:'badge_stall',   name:'Fã de Stall',   price:30, emoji:'🐌' },
    { id:'badge_speed',   name:'Speedrunner',   price:30, emoji:'⚡' },
    { id:'badge_lucky',   name:'Sortudo',       price:30, emoji:'🍀' },
    { id:'badge_veteran', name:'Veterano',      price:50, emoji:'🎖️' },
    { id:'badge_hazards', name:'Fã de Hazards', price:30, emoji:'🕸️' },
    { id:'badge_allin',   name:'All-in',        price:30, emoji:'🎲' },
    { id:'badge_collector', name:'Colecionador', price:50, emoji:'🗂️' },
    { id:'badge_analyst', name:'Analista',      price:30, emoji:'🔍' },
    { id:'badge_vm_kanto',  name:'Selo de Kanto',  price:0, emoji:'🗼', eventOnly:'volta-ao-mundo' },
    { id:'badge_vm_johto',  name:'Selo de Johto',  price:0, emoji:'🔔', eventOnly:'volta-ao-mundo' },
    { id:'badge_vm_hoenn',  name:'Selo de Hoenn',  price:0, emoji:'🌋', eventOnly:'volta-ao-mundo' },
    { id:'badge_vm_sinnoh', name:'Selo de Sinnoh', price:0, emoji:'❄️', eventOnly:'volta-ao-mundo' },
    // Lembranças da loja de Milhas (ver backgrounds).
    { id:'badge_vm_passaporte', name:'Passaporte Carimbado', price:0, emoji:'🛂', eventOnly:'volta-ao-mundo' },
    { id:'badge_vm_mapa',       name:'Mapa-múndi',           price:0, emoji:'🗺️', eventOnly:'volta-ao-mundo' },
    { id:'badge_vm_bussola',    name:'Bússola',              price:0, emoji:'🧭', eventOnly:'volta-ao-mundo' },
    { id:'badge_vm_camera',     name:'Fotógrafo de Viagem',  price:0, emoji:'📸', eventOnly:'volta-ao-mundo' },
    { id:'badge_vm_bilhete',    name:'Bilhete Dourado',      price:0, emoji:'🎫', eventOnly:'volta-ao-mundo' },
    // Itens baratos (2.ª ronda da loja de Milhas): para quem tem poucas Milhas.
    { id:'badge_vm_etiqueta',   name:'Etiqueta de Bagagem',  price:0, emoji:'🏷️', eventOnly:'volta-ao-mundo' },
    { id:'badge_vm_bone',       name:'Boné de Viajante',     price:0, emoji:'🧢', eventOnly:'volta-ao-mundo' }
  ],
  features: [
    { id:'feature_custom_pagebg', name:'Fundo de perfil personalizado (foto)', price:120 },
    { id:'feature_custom_sitebg', name:'Fundo de página personalizado (foto)', price:150 }
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
  if(item.eventOnly) return {ok:false, reason:'eventonly'}; // itens de evento nunca se compram
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&select=coins,owned_cosmetics,total_daily_claims`, {headers: sbAuthHeaders(supabaseAnonKey)});
  const rows = await res.json();
  if(!rows || !rows[0]) return {ok:false, reason:'notfound'};
  const current = rows[0];
  const owned = current.owned_cosmetics || [];
  if(owned.includes(cosmeticId)) return {ok:false, reason:'alreadyowned'};
  const discountPct = computeLoyaltyDiscountPct(current.total_daily_claims);
  const finalPrice = applyLoyaltyDiscount(item.price, discountPct);
  if((current.coins||0) < finalPrice) return {ok:false, reason:'insufficient'};

  // Uma só operação na base de dados: confere que ainda não tem o item e que há moedas, debita, junta o item e regista o histórico.
  const reason = discountPct > 0 ? `Compra na loja: ${item.name} (${discountPct}% de desconto por fidelidade)` : `Compra na loja: ${item.name}`;
  const r = await purchaseCosmeticAtomic(supabaseUrl, supabaseAnonKey, name, cosmeticId, finalPrice, reason);
  if(!r.ok) return {ok:false, reason:r.reason};
  return {ok:true, finalPrice, discountPct};
}

// Compra atómica de um cosmético (função buy_cosmetic_item). Devolve {ok, reason} —
// reason: 'insufficient' | 'alreadyowned' | 'notfound' | 'error'. O preço (com descontos) é calculado por quem chama.
async function purchaseCosmeticAtomic(supabaseUrl, supabaseAnonKey, name, itemId, price, reason){
  const r = await dbFunction(supabaseUrl, supabaseAnonKey, 'buy_cosmetic_item', { p_name:name, p_item:itemId, p_price:price, p_reason:reason, p_token:getPlayerToken(name) });
  if(!r.ok || !r.data) return {ok:false, reason:'error'};
  if(r.data.ok) return {ok:true, balance:r.data.balance};
  if(r.data.reason === 'auth'){ handleSessionExpired(); return {ok:false, reason:'error'}; }
  return {ok:false, reason: ['insufficient','alreadyowned','notfound'].includes(r.data.reason) ? r.data.reason : 'error'};
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

// Define o link da foto usada como fundo da PÁGINA de perfil inteira (só
// faz sentido depois de comprar 'feature_custom_sitebg') — diferente do
// fundo do cartão principal (feature_custom_pagebg/profile_background_url
// acima), os dois são independentes e um jogador pode ter os dois.
async function setSiteBackgroundUrl(supabaseUrl, supabaseAnonKey, name, url){
  const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
    method:'PATCH',
    headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
    body: JSON.stringify({ site_background_url: url || null })
  });
  return res.ok;
}

// Devolve HTML de um avatar: <img> se houver photo_url, senão um círculo com
// as iniciais, usando o fundo e a moldura personalizados equipados (se existirem).
// ---------- Decorações Animadas do Avatar ----------
// A "Moldura" é o tipo de efeito animado à volta do avatar; a "Cor da moldura" (antes "Fundo do avatar") é só a COR usada por esse efeito —
// assim as duas personalizações nunca competem visualmente uma com a outra.
function ensureAvatarFxStyles(){
  if(document.getElementById('vseAvatarFxStyles')) return;
  const style = document.createElement('style');
  style.id = 'vseAvatarFxStyles';
  style.textContent = `
    .avatar-fx-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}
    .avatar-fx-layer{position:absolute;inset:0;pointer-events:none;}
    .avatar-fx-layer span{position:absolute;top:50%;left:50%;}

    /* Molduras redesenhadas. Todas usam --fx-color (a "Cor da moldura") e as variáveis --fx-gem (tamanho das peças),
       --fx-wrap (lado total) e --fx-pad (folga à volta do avatar), definidas em avatarHtml. Cada uma tem uma
       linguagem de movimento própria: Faíscas = disparos radiais; Estrelado = estrelas de 4 pontas em órbita a
       cintilar; Florescer = pétalas em órbita lenta que respiram. Um anel suave comum dá presença à cor mesmo a meio
       do ciclo. Sem filtros SVG (rasterizavam mal): só gradientes, clip-path, sombras e drop-shadow de HTML. */
    @keyframes vseRingBreath{0%,100%{opacity:0.55;transform:scale(1);}50%{opacity:1;transform:scale(1.035);}}
    .avatar-fx-sparks::before,.avatar-fx-starry::before,.avatar-fx-blossom::before{content:'';position:absolute;inset:calc(var(--fx-pad,10px)*0.72);border-radius:calc(var(--fx-wrap,60px)*0.2);
      box-shadow:0 0 0 1.5px color-mix(in srgb,var(--fx-color) 44%,transparent),0 0 12px color-mix(in srgb,var(--fx-color) 36%,transparent),inset 0 0 10px color-mix(in srgb,var(--fx-color) 20%,transparent);
      animation:vseRingBreath 3.2s ease-in-out infinite;}

    @keyframes vseSparkShoot{
      0%{opacity:0;transform:translate(-50%,-50%) rotate(var(--a,0deg)) translateY(calc(var(--fx-wrap,60px)*-0.30)) scaleY(0.2);}
      22%{opacity:1;transform:translate(-50%,-50%) rotate(var(--a,0deg)) translateY(calc(var(--fx-wrap,60px)*-0.35)) scaleY(1);}
      100%{opacity:0;transform:translate(-50%,-50%) rotate(var(--a,0deg)) translateY(calc(var(--fx-wrap,60px)*-0.54)) scaleY(0.45);}}
    .avatar-fx-sparks span{top:50%!important;left:50%!important;width:max(2px,calc(var(--fx-gem,9px)*0.26));height:calc(var(--fx-gem,9px)*1.3);border-radius:2px;
      background:linear-gradient(to top,transparent,color-mix(in srgb,var(--fx-color) 65%,#fff) 65%,#fff);
      box-shadow:0 0 5px var(--fx-color);animation:vseSparkShoot 1.4s ease-out infinite;}

    @keyframes vseOrbitVar{from{transform:rotate(var(--a0,0deg));}to{transform:rotate(calc(var(--a0,0deg) + 360deg));}}
    @keyframes vseOrbitVarRev{from{transform:rotate(var(--a0,0deg));}to{transform:rotate(calc(var(--a0,0deg) - 360deg));}}
    @keyframes vseStarTwinkle{0%,100%{opacity:0.35;transform:translate(-50%,0) scale(0.55) rotate(0deg);}50%{opacity:1;transform:translate(-50%,0) scale(1.2) rotate(45deg);}}
    .avatar-fx-starry span{top:0!important;left:0!important;width:100%;height:100%;animation:vseOrbitVar 18s linear infinite;animation-delay:0s!important;}
    .avatar-fx-starry span::before{content:'';position:absolute;top:calc(var(--fx-pad,10px)*0.2);left:50%;width:calc(var(--fx-gem,9px)*1.35);height:calc(var(--fx-gem,9px)*1.35);
      background:radial-gradient(circle at 50% 50%,#fff 0 18%,color-mix(in srgb,var(--fx-color) 70%,#fff) 19% 46%,var(--fx-color) 47%);
      clip-path:polygon(50% 0%,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0% 50%,39% 39%);
      filter:drop-shadow(0 0 3px var(--fx-color));animation:vseStarTwinkle 2.4s ease-in-out infinite;animation-delay:var(--d,0s);}

    @keyframes vsePetalBreath{0%,100%{opacity:0.55;transform:translate(-50%,0) rotate(45deg) scale(0.7);}50%{opacity:1;transform:translate(-50%,calc(var(--fx-pad,10px)*-0.22)) rotate(45deg) scale(1.15);}}
    .avatar-fx-blossom span{top:0!important;left:0!important;width:100%;height:100%;animation:vseOrbitVarRev 26s linear infinite;animation-delay:0s!important;}
    .avatar-fx-blossom span::before{content:'';position:absolute;top:calc(var(--fx-pad,10px)*0.25);left:50%;width:calc(var(--fx-gem,9px)*1.25);height:calc(var(--fx-gem,9px)*1.25);
      background:linear-gradient(135deg,color-mix(in srgb,var(--fx-color) 55%,#fff),var(--fx-color));border-radius:0 100% 0 100%;
      box-shadow:0 0 6px color-mix(in srgb,var(--fx-color) 60%,transparent);animation:vsePetalBreath 3.6s ease-in-out infinite;animation-delay:var(--d,0s);}

    /* Diamante Prismático (exclusivo de leilão): anel prismático que gira à volta
       do avatar, brilho que varre a foto, e 4 gemas nos pontos cardeais que
       piscam em sequência, seguindo o anel. Usa --fx-color + branco, por isso
       continua a respeitar a "Cor da moldura" escolhida (e a Aurora). */
    @property --vse-dia-angle{syntax:'<angle>';inherits:false;initial-value:0deg;}
    @keyframes vseDiaSpin{to{--vse-dia-angle:360deg;}}
    @keyframes vseDiaShine{0%,50%{background-position:160% 0;}100%{background-position:-60% 0;}}
    @keyframes vseDiaGlint{0%,100%{opacity:0.5;transform:translate(-50%,-50%) scale(0.75) rotate(0deg);}9%{opacity:1;transform:translate(-50%,-50%) scale(1.35) rotate(18deg);}26%{opacity:0.6;transform:translate(-50%,-50%) scale(0.9) rotate(0deg);}}
    .avatar-fx-diamond::before{content:'';position:absolute;inset:14%;border-radius:32%;padding:2px;
      background:conic-gradient(from var(--vse-dia-angle),transparent 0deg,var(--fx-color) 35deg,#fff 70deg,var(--fx-color) 105deg,transparent 140deg,transparent 180deg,color-mix(in srgb,var(--fx-color) 55%,transparent) 215deg,transparent 250deg,transparent 360deg),
        linear-gradient(color-mix(in srgb,var(--fx-color) 22%,transparent),color-mix(in srgb,var(--fx-color) 22%,transparent));
      -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;
      mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;
      animation:vseDiaSpin 4s linear infinite;}
    .avatar-fx-diamond::after{content:'';position:absolute;inset:18%;border-radius:28%;
      background:linear-gradient(115deg,transparent 42%,rgba(255,255,255,0.5) 50%,transparent 58%) 160% 0/250% 100% no-repeat;
      animation:vseDiaShine 4s ease-in-out infinite;}
    .avatar-fx-diamond span{width:var(--fx-gem,9px);height:var(--fx-gem,9px);
      background:radial-gradient(circle,color-mix(in srgb,var(--fx-color) 65%,#fff) 0%,transparent 68%);
      animation:vseDiaGlint 4s ease-in-out infinite;}
    .avatar-fx-diamond span::before{content:'';position:absolute;inset:16%;
      background:linear-gradient(160deg,#fff 0 32%,color-mix(in srgb,var(--fx-color) 55%,#fff) 32% 62%,var(--fx-color) 62%);
      clip-path:polygon(50% 100%,0% 38%,22% 0%,78% 0%,100% 38%);}

    /* Rota Aérea (evento Volta ao Mundo): um avião a dar a volta ao avatar. O <span> ocupa a
       camada toda e RODA (não animamos a própria camada, senão a classe multicolor da Aurora
       sobrepunha-se); o avião é o ::before no topo do span e o rasto é o ::after. */
    @keyframes vsePlaneOrbit{to{transform:rotate(360deg);}}
    .avatar-fx-plane span{top:0!important;left:0!important;width:100%;height:100%;
      animation:vsePlaneOrbit 7s linear infinite;animation-delay:0s!important;}
    .avatar-fx-plane span::before{content:'';position:absolute;top:2%;left:50%;width:calc(var(--fx-gem,9px)*1.7);height:calc(var(--fx-gem,9px)*1.7);
      transform:translate(-50%,0) rotate(90deg);background:var(--fx-color);
      clip-path:polygon(50% 0%,60% 38%,100% 62%,100% 74%,58% 62%,56% 84%,72% 94%,72% 100%,50% 94%,28% 100%,28% 94%,44% 84%,42% 62%,0% 74%,0% 62%,40% 38%);}
    .avatar-fx-plane span::after{content:'';position:absolute;top:calc(2% + var(--fx-gem,9px)*0.85);left:calc(50% - 24%);width:24%;height:2px;
      background:linear-gradient(90deg,transparent,var(--fx-color));opacity:0.55;}

    /* Esquadrilha (evento Volta ao Mundo, nível 12): 3 aviões a rodar em órbitas diferentes (um em sentido
       contrário). Mesma técnica da Rota Aérea: cada <span> ocupa a camada toda e RODA. */
    .avatar-fx-fleet span{top:0!important;left:0!important;width:100%;height:100%;animation:vsePlaneOrbit 8s linear infinite;animation-delay:0s!important;}
    .avatar-fx-fleet span:nth-child(2){animation-duration:11s;animation-direction:reverse;}
    .avatar-fx-fleet span:nth-child(3){animation-duration:15s;animation-delay:-5s!important;}
    .avatar-fx-fleet span::before{content:'';position:absolute;top:2%;left:50%;width:calc(var(--fx-gem,9px)*1.3);height:calc(var(--fx-gem,9px)*1.3);
      transform:translate(-50%,0) rotate(90deg);background:var(--fx-color);
      clip-path:polygon(50% 0%,60% 38%,100% 62%,100% 74%,58% 62%,56% 84%,72% 94%,72% 100%,50% 94%,28% 100%,28% 94%,44% 84%,42% 62%,0% 74%,0% 62%,40% 38%);}
    .avatar-fx-fleet span:nth-child(2)::before{top:9%;opacity:0.85;transform:translate(-50%,0) rotate(-90deg);}
    .avatar-fx-fleet span:nth-child(3)::before{top:16%;opacity:0.7;}

    /* Balão de Ar Quente (evento Volta ao Mundo, loja de Milhas): um balão que dá a volta ao avatar e sobe e desce devagar. É UMA só peça (clip-path:
       balão com listas na cor da moldura + pescoço + cesto castanho); o <span> ocupa a camada toda e RODA (como a Rota Aérea) e o balão roda ao
       contrário à mesma velocidade para ficar sempre na vertical. */
    @keyframes vseBalloonOrbit{to{transform:rotate(360deg);}}
    @keyframes vseBalloonUpright{from{transform:translate(-50%,0) rotate(0deg);}to{transform:translate(-50%,0) rotate(-360deg);}}
    @keyframes vseBalloonBob{0%,100%{top:1%;}50%{top:4%;}}
    .avatar-fx-balloon span{top:0!important;left:0!important;width:100%;height:100%;animation:vseBalloonOrbit 18s linear infinite;animation-delay:0s!important;
      filter:drop-shadow(0 0 3px color-mix(in srgb,var(--fx-color) 55%,transparent));}
    .avatar-fx-balloon span::before{content:'';position:absolute;top:1%;left:50%;width:calc(var(--fx-gem,9px)*1.25);height:calc(var(--fx-gem,9px)*1.62);
      transform:translate(-50%,0);
      background:linear-gradient(#7b4f27,#7b4f27) 50% 100%/34% 21% no-repeat,
        radial-gradient(circle at 34% 26%,rgba(255,255,255,0.55) 0,transparent 30%),
        repeating-linear-gradient(90deg,var(--fx-color) 0 12%,color-mix(in srgb,var(--fx-color) 38%,#fff) 12% 24%);
      clip-path:polygon(50.0% 1.5%,58.2% 2.1%,66.1% 3.6%,73.5% 6.1%,80.2% 9.5%,86.0% 13.6%,90.7% 18.5%,94.2% 23.8%,96.3% 29.5%,97.0% 35.4%,95.7% 39.4%,93.2% 43.5%,89.7% 47.5%,85.5% 51.5%,80.5% 55.6%,74.9% 59.6%,68.7% 63.7%,62.0% 67.7%,58.0% 76.9%,64.0% 76.9%,64.0% 96.9%,36.0% 96.9%,36.0% 76.9%,42.0% 76.9%,38.0% 67.7%,31.3% 63.7%,25.1% 59.6%,19.5% 55.6%,14.5% 51.5%,10.3% 47.5%,6.8% 43.5%,4.3% 39.4%,3.0% 35.4%,3.7% 29.5%,5.8% 23.8%,9.3% 18.5%,14.0% 13.6%,19.8% 9.5%,26.5% 6.1%,33.9% 3.6%,41.8% 2.1%);
      animation:vseBalloonUpright 18s linear infinite,vseBalloonBob 3.4s ease-in-out infinite;}
    @media (prefers-reduced-motion:reduce){.avatar-fx-balloon span,.avatar-fx-balloon span::before{animation:none!important;}}

    @keyframes vseFxHueRotate{0%{filter:hue-rotate(0deg);}100%{filter:hue-rotate(360deg);}}
    .avatar-fx-layer.avatar-fx-multicolor{animation:vseFxHueRotate 5s linear infinite;}
  `;
  document.head.appendChild(style);
}

// Pré-visualização de uma moldura nos cartões da loja/personalização: um avatar de verdade com a animação e a cor
// equipada, para se ver o que se está a comprar/usar.
// O segundo argumento pode ser o perfil do jogador (usa a "Cor da moldura" que tem equipada) ou uma cor (#hex).
function frameEffectPreviewHtml(effectType, profileOrColor, multiColor){
  if(!effectType || effectType === 'none'){
    return `<div class="shop-swatch" style="height:64px;background:var(--bg-panel);border:2px dashed var(--line);"></div>`;
  }
  let color = '#a56bf0', multi = !!multiColor;
  if(typeof profileOrColor === 'string') color = profileOrColor;
  else if(profileOrColor && profileOrColor.equippedBackground){
    const bg = getCosmeticById(profileOrColor.equippedBackground);
    if(bg){ color = bg.color; multi = !!bg.multiColor; }
  }
  return `<div class="shop-swatch" style="height:64px;display:flex;align-items:center;justify-content:center;background:var(--bg-panel);">${avatarHtml('AB', null, 34, color, effectType, multi)}</div>`;
}

// ---------- Efeitos de nome ----------
// Quatro identidades bem diferentes (a cor base é sempre a "cor de destaque" do jogador, via currentColor):
//  Brilho = halo de néon ESTÁTICO · Pulsar = batimento cardíaco (escala + brilho) · Rasto de Avião = linhas de
//  velocidade atrás do nome, texto inclinado · Aurora de Cabine = gradiente de várias cores a fluir.
function ensureNameFxStyles(){
  if(document.getElementById('vseNameFxStyles')) return;
  const style = document.createElement('style');
  style.id = 'vseNameFxStyles';
  style.textContent = `
    .name-fx{display:inline-block;max-width:100%;}
    .name-fx-glow{text-shadow:0 0 3px currentColor,0 0 9px currentColor,0 0 20px color-mix(in srgb,currentColor 60%,transparent);}
    @keyframes vseNameBeat{
      0%,45%,100%{transform:scale(1);text-shadow:0 0 0 transparent;}
      10%{transform:scale(1.08);text-shadow:0 0 10px currentColor;}
      20%{transform:scale(1);text-shadow:0 0 3px currentColor;}
      30%{transform:scale(1.05);text-shadow:0 0 8px currentColor;}}
    .name-fx-pulse{transform-origin:left center;animation:vseNameBeat 1.8s ease-in-out infinite;}
    @keyframes vseNameTrail{0%,100%{transform:scaleX(0.3);opacity:0;}30%{opacity:0.9;}60%{transform:scaleX(1);opacity:0.9;}88%{opacity:0;}}
    .name-fx-contrail{position:relative;font-style:italic;text-shadow:-2px 0 0 color-mix(in srgb,currentColor 35%,transparent);}
    .name-fx-contrail::before,.name-fx-contrail::after{content:'';position:absolute;right:100%;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,currentColor);transform-origin:100% 50%;animation:vseNameTrail 2.4s ease-out infinite;}
    .name-fx-contrail::before{top:34%;width:0.9em;margin-right:2px;}
    .name-fx-contrail::after{top:66%;width:1.5em;margin-right:6px;animation-delay:0.35s;}
    @keyframes vseNameFlow{to{background-position:300% 0;}}
    .name-fx-aurora{background:linear-gradient(90deg,#4fa8f0,#a56bf0,#f0b64f,#e0607a,#4fa8f0);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;
      -webkit-text-fill-color:transparent;color:transparent;animation:vseNameFlow 5s linear infinite;filter:drop-shadow(0 0 5px rgba(165,107,240,0.45));}
  `;
  document.head.appendChild(style);
}
// Classes a pôr no elemento que mostra o nome ('' se o cosmético não tiver efeito).
function nameFxClass(cosmetic){
  if(!cosmetic || !cosmetic.fx) return '';
  ensureNameFxStyles();
  return `name-fx name-fx-${cosmetic.fx}`;
}
// Cartão de pré-visualização ("Abc") do efeito de nome, na cor de destaque que o jogador tem equipada.
function nameEffectPreviewHtml(item, profile){
  const acc = profile && profile.equippedAccent ? getCosmeticById(profile.equippedAccent) : null;
  const color = acc && acc.color ? acc.color : 'var(--tera-cyan)';
  return `<div class="shop-swatch" style="height:44px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg-panel);color:${color};font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:15px;"><span class="${nameFxClass(item)}">Abc</span></div>`;
}

const AVATAR_FX_COUNTS = { sparks:10, starry:6, blossom:5, diamond:4, plane:1, fleet:3, balloon:1 };
// Efeitos que não usam os primeiros N ângulos da lista acima — o Diamante
// quer as 4 gemas espalhadas pelos pontos cardeais (direita, baixo, esquerda,
// cima), pela ordem em que o anel as "visita" ao rodar.
const AVATAR_FX_ANGLE_OVERRIDES = { diamond:[0, 90, 180, 270], plane:[0], fleet:[0, 0, 0], balloon:[0] };
// Duração (s) do ciclo de cada efeito, para espaçar o atraso de cada partícula.
const AVATAR_FX_PERIODS = { sparks:1.4, starry:2.4, blossom:3.6, diamond:4 };

function avatarFxParticlesHtml(effectType, radiusPct){
  const count = AVATAR_FX_COUNTS[effectType] || 6;
  // Por defeito as peças ficam espaçadas por igual à volta do avatar (antes usava os primeiros N de 8 ângulos fixos, o
  // que deixava metade da volta vazia nos efeitos de 5-6 peças).
  const angles = AVATAR_FX_ANGLE_OVERRIDES[effectType] || Array.from({ length: count }, (_, i) => i * 360 / count);
  const period = AVATAR_FX_PERIODS[effectType] || 2.4;
  return angles.map((deg, i)=>{
    const rad = deg * Math.PI / 180;
    const x = 50 + radiusPct * Math.cos(rad);
    const y = 50 + radiusPct * Math.sin(rad);
    const delay = (i * (period / count)).toFixed(2);
    return `<span style="top:${y.toFixed(1)}%;left:${x.toFixed(1)}%;animation-delay:${delay}s;--a:${deg.toFixed(1)}deg;--a0:${deg.toFixed(1)}deg;--d:${delay}s;"></span>`;
  }).join('');
}

// effectColor: cor (hex) escolhida em "Cor da moldura". effectType: 'none' |
// 'sparks' | 'starry' | 'blossom' | 'diamond' | 'plane' | 'fleet' | 'balloon'. multiColor: true para a Aurora Animada,
// faz o efeito ciclar de cor continuamente em vez de ficar fixo.
function avatarHtml(name, photoUrl, sizePx, effectColor, effectType, multiColor){
  const size = sizePx || 44;
  const hasEffect = effectType && effectType !== 'none';
  const contentRadius = Math.round(size*0.28);

  let innerHtml;
  if(photoUrl){
    innerHtml = `<img src="${photoUrl.replace(/"/g,'&quot;')}" alt="${(name||'').replace(/"/g,'&quot;')}" width="${size}" height="${size}" loading="lazy" decoding="async" style="width:${size}px;height:${size}px;border-radius:${contentRadius}px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none';">`;
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

  const gemSize = Math.max(Math.round(size*0.2), 7);

  return `<div class="avatar-fx-wrap" style="--fx-color:${color};--fx-gem:${gemSize}px;--fx-wrap:${wrapSize}px;--fx-pad:${wrapPad}px;width:${wrapSize}px;height:${wrapSize}px;">
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
        <div class="${nameFxClass(nameEffectCosmetic)}" style="font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:14px;color:${accentColor};">${trophy} ${escapeHtml(displayName)} ${equippedBadgeEmojis}</div>
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
// Devolve {ok, reason} — 'invalid' | 'insufficient' | 'error' | true
async function giftCoins(supabaseUrl, supabaseAnonKey, fromName, toName, amount){
  if(!amount || amount <= 0) return {ok:false, reason:'invalid'};
  if(fromName === toName) return {ok:false, reason:'invalid'};

  // Uma só operação na base de dados: debita um, credita o outro, regista o histórico dos dois e o ranking de generosidade.
  const r = await dbFunction(supabaseUrl, supabaseAnonKey, 'transfer_coins', { p_from:fromName, p_to:toName, p_amount:Math.round(amount), p_token:getPlayerToken(fromName) });
  if(!r.ok || !r.data) return {ok:false, reason:'error'};
  if(r.data.ok) return {ok:true};
  if(r.data.reason === 'auth'){ handleSessionExpired(); return {ok:false, reason:'error'}; }
  return {ok:false, reason: ['insufficient','invalid'].includes(r.data.reason) ? r.data.reason : 'error'};
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

  // O destinatário recebe o item de forma atómica (sem apagar uma compra que ele esteja a fazer ao mesmo tempo).
  // Se entretanto já tiver esse item (added vazio) ou a operação falhar, o preço é devolvido.
  const g = await grantCosmeticAtomic(supabaseUrl, supabaseAnonKey, toName, [won.id]);
  if(!g.ok || !g.added.length){
    await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, fromName, SURPRISE_GIFT_PRICE, 'Estorno de Presente Surpresa (falhou)');
    return {ok:false, reason:'error'};
  }
  await logCoinTransaction(supabaseUrl, supabaseAnonKey, toName, 0, `Recebeu Presente Surpresa de ${fromName}: ${won.name}`);
  return {ok:true, item: won};
}

// ---------- Troca de Cosméticos entre Jogadores ----------
// Troca dirigida (from_name propõe a to_name), por moedas ou por outro item
// específico. Só se concretiza quando to_name aceita (tabela trade_offers,
// coluna status: pending/accepted/rejected/cancelled).

// Itens realmente "possuídos" por um jogador, elegíveis para trocar — exclui
// os itens gratuitos-para-todos (price 0 e não vindos de leilão), que não são
// posses reais (mesmo padrão de "owned" usado em shopItemHtml, loja.html).
function getTradeableOwnedItems(profile){
  const owned = (profile && profile.ownedCosmetics) || [];
  return owned.map(id=>getCosmeticById(id)).filter(item=>item && !(item.price===0 && !item.auctionOnly));
}

function findCosmeticCategory(itemId){
  for(const [cat, list] of Object.entries(COSMETIC_CATALOG)){
    if(list.some(c=>c.id===itemId)) return cat;
  }
  return null;
}

const TRADE_CATEGORY_TO_EQUIPPED_FIELD = {
  backgrounds:'equipped_background', accents:'equipped_accent', frames:'equipped_frame',
  nameEffects:'equipped_name_effect', titles:'equipped_title'
};

// Devolve só os campos que precisam de ser limpos no PATCH, se o item trocado
// estiver equipado (evita ficar com um cosmético equipado que já não possui).
function buildUnequipPatchIfNeeded(rawPlayerRow, itemId){
  const patch = {};
  const cat = findCosmeticCategory(itemId);
  const field = cat && TRADE_CATEGORY_TO_EQUIPPED_FIELD[cat];
  if(field && rawPlayerRow[field] === itemId) patch[field] = null;
  if((rawPlayerRow.equipped_badges||[]).includes(itemId)){
    patch.equipped_badges = (rawPlayerRow.equipped_badges||[]).filter(b=>b!==itemId);
  }
  return patch;
}

// Devolve {ok, reason} — 'invalid' | 'error' | true
async function createTradeOffer(supabaseUrl, supabaseAnonKey, fromName, toName, offeredItemId, requestedCoins, requestedItemId){
  if(fromName === toName) return {ok:false, reason:'invalid'};
  if(!offeredItemId) return {ok:false, reason:'invalid'};
  if(!requestedCoins && !requestedItemId) return {ok:false, reason:'invalid'};
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/trade_offers`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify([{ from_name:fromName, to_name:toName, offered_item_id:offeredItemId, requested_coins: requestedCoins||null, requested_item_id: requestedItemId||null, status:'pending' }])
    });
    return { ok: res.ok };
  } catch(e){ return {ok:false, reason:'error'}; }
}

async function fetchTradeOffers(supabaseUrl, supabaseAnonKey, playerName){
  try{
    const [incomingRes, outgoingRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/trade_offers?to_name=eq.${encodeURIComponent(playerName)}&status=eq.pending&order=created_at.desc`, {headers: sbAuthHeaders(supabaseAnonKey)}),
      fetch(`${supabaseUrl}/rest/v1/trade_offers?from_name=eq.${encodeURIComponent(playerName)}&status=eq.pending&order=created_at.desc`, {headers: sbAuthHeaders(supabaseAnonKey)})
    ]);
    return { incoming: await incomingRes.json(), outgoing: await outgoingRes.json() };
  } catch(e){ return {incoming:[], outgoing:[]}; }
}

// status: 'rejected' | 'cancelled' — só muda o status, não mexe em moedas/itens
async function setTradeOfferStatus(supabaseUrl, supabaseAnonKey, offerId, status){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/trade_offers?id=eq.${offerId}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({status})
    });
    return res.ok;
  } catch(e){ return false; }
}

// Devolve {ok, reason} — 'invalid' (deixou de ser possível cumprir, proposta
// rejeitada automaticamente) | 'error' | true. Busca dados frescos dos dois
// jogadores (nunca confia em cache — a proposta pode ter dias).
async function acceptTradeOffer(supabaseUrl, supabaseAnonKey, offer){
  try{
    const fields = 'coins,owned_cosmetics,equipped_background,equipped_accent,equipped_frame,equipped_name_effect,equipped_title,equipped_badges';
    const [fromRes, toRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(offer.from_name)}&select=${fields}`, {headers: sbAuthHeaders(supabaseAnonKey)}),
      fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(offer.to_name)}&select=${fields}`, {headers: sbAuthHeaders(supabaseAnonKey)})
    ]);
    const fromRow = (await fromRes.json())[0];
    const toRow = (await toRes.json())[0];
    if(!fromRow || !toRow) return {ok:false, reason:'error'};

    const fromOwned = fromRow.owned_cosmetics || [];
    const toOwned = toRow.owned_cosmetics || [];
    const stillHasOffered = fromOwned.includes(offer.offered_item_id);
    const stillHasRequestedItem = !offer.requested_item_id || toOwned.includes(offer.requested_item_id);
    const hasEnoughCoins = !offer.requested_coins || (toRow.coins||0) >= offer.requested_coins;

    if(!stillHasOffered || !stillHasRequestedItem || !hasEnoughCoins){
      await setTradeOfferStatus(supabaseUrl, supabaseAnonKey, offer.id, 'rejected');
      return {ok:false, reason:'invalid'};
    }

    // As moedas primeiro (função atómica, recusa se o saldo já não chegar): assim nunca se trocam os itens sem o pagamento.
    if(offer.requested_coins){
      const paid = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, offer.to_name, -offer.requested_coins, `Troca de cosmético com ${offer.from_name}`);
      if(!paid){
        await setTradeOfferStatus(supabaseUrl, supabaseAnonKey, offer.id, 'rejected');
        return {ok:false, reason:'invalid'};
      }
    }

    let newFromOwned = fromOwned.filter(id=>id!==offer.offered_item_id);
    let newToOwned = toOwned.concat([offer.offered_item_id]);
    if(offer.requested_item_id){
      newToOwned = newToOwned.filter(id=>id!==offer.requested_item_id);
      newFromOwned = newFromOwned.concat([offer.requested_item_id]);
    }

    const fromPatch = Object.assign({ owned_cosmetics:newFromOwned }, buildUnequipPatchIfNeeded(fromRow, offer.offered_item_id));
    const toPatch = Object.assign({ owned_cosmetics:newToOwned }, offer.requested_item_id ? buildUnequipPatchIfNeeded(toRow, offer.requested_item_id) : {});

    const [fromPatchRes, toPatchRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(offer.from_name)}`, {
        method:'PATCH', headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}), body: JSON.stringify(fromPatch)
      }),
      fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(offer.to_name)}`, {
        method:'PATCH', headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}), body: JSON.stringify(toPatch)
      })
    ]);
    if(!fromPatchRes.ok || !toPatchRes.ok){
      if(offer.requested_coins) await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, offer.to_name, offer.requested_coins, 'Estorno de troca de cosmético (falhou)');
      return {ok:false, reason:'error'};
    }

    if(offer.requested_coins){
      await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, offer.from_name, offer.requested_coins, `Troca de cosmético com ${offer.to_name}`);
    }

    await setTradeOfferStatus(supabaseUrl, supabaseAnonKey, offer.id, 'accepted');
    return {ok:true};
  } catch(e){ return {ok:false, reason:'error'}; }
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
// ATÓMICO: a base de dados (função adjust_coins) bloqueia a linha do jogador, confere o saldo, altera-o e regista o
// histórico numa só operação. Se o saldo não chegar para um débito devolve false e NADA muda (antes limitava a 0).
// Antes disto o site lia o saldo e escrevia o novo valor: duas ações ao mesmo tempo apagavam-se uma à outra.
async function adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, amount, reason){
  if(!name || !amount) return false;
  const r = await dbFunction(supabaseUrl, supabaseAnonKey, 'adjust_coins', { p_name:name, p_delta:Math.round(amount), p_reason:reason || null, p_strict:true, p_token:getPlayerToken(name) });
  if(r.data && r.data.reason === 'auth') handleSessionExpired();
  return !!(r.ok && r.data && r.data.ok);
}

// Dá cosméticos a um jogador SEM duplicar e sem apagar compras feitas ao mesmo tempo (função grant_cosmetics).
// Devolve {ok, added:[ids realmente novos]}.
async function grantCosmeticAtomic(supabaseUrl, supabaseAnonKey, name, ids){
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if(!name || !list.length) return {ok:true, added:[]};
  const r = await dbFunction(supabaseUrl, supabaseAnonKey, 'grant_cosmetics', { p_name:name, p_items:list });
  if(!r.ok || !r.data || !r.data.ok) return {ok:false, added:[]};
  return {ok:true, added: r.data.added || []};
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

  // Compra única: reclama o desbloqueio ANTES de cobrar (só uma chamada o consegue, mesmo num duplo clique) e desfaz se a cobrança falhar.
  const claim = await claimPlayerFlag(supabaseUrl, supabaseAnonKey, name, 'elo_chart_unlocked');
  if(claim === null) return {ok:false, reason:'error'};
  if(claim === false) return {ok:false, reason:'alreadyunlocked'};
  const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, -ELO_CHART_PRICE, 'Desbloqueio do gráfico de evolução do Elo');
  if(!ok){
    await setPlayerFlag(supabaseUrl, supabaseAnonKey, name, 'elo_chart_unlocked', false);
    return {ok:false, reason:'error'};
  }
  return {ok:true};
}

// Liga uma opção de compra única (coluna boolean de players) SÓ se ainda estiver desligada. Devolve true (esta chamada ligou-a),
// false (já estava ligada) ou null (erro de rede/servidor).
async function claimPlayerFlag(supabaseUrl, supabaseAnonKey, name, column){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}&or=(${column}.is.null,${column}.eq.false)`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=representation'}),
      body: JSON.stringify({ [column]: true })
    });
    if(!res.ok) return null;
    const rows = await res.json();
    return !!(rows && rows.length);
  } catch(e){ return null; }
}
async function setPlayerFlag(supabaseUrl, supabaseAnonKey, name, column, value){
  try{
    await fetch(`${supabaseUrl}/rest/v1/players?name=eq.${encodeURIComponent(name)}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({ [column]: value })
    });
  } catch(e){ /* sem rede: o organizador acerta à mão */ }
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

  // Reclama a garantia ANTES de cobrar (só uma chamada a consegue) e desfaz se a cobrança falhar.
  const claim = await claimPlayerFlag(supabaseUrl, supabaseAnonKey, name, 'guaranteed_bye');
  if(claim === null) return {ok:false, reason:'error'};
  if(claim === false) return {ok:false, reason:'alreadyactive'};
  const ok = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, name, -GUARANTEED_BYE_PRICE, 'Garantia de bye no Play-in');
  if(!ok){
    await setPlayerFlag(supabaseUrl, supabaseAnonKey, name, 'guaranteed_bye', false);
    return {ok:false, reason:'error'};
  }
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
    // Torneios de evento têm o tier próprio "Evento" (não é um dos tiers do ciclo) — ignorar.
    if(!ALL_TIERS.includes(tier)) return;
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
  // Durante um evento o tier das semanas seguintes é fixo — votar só gastaria moedas em vão.
  const activeEv = await fetchActiveEvent(supabaseUrl, supabaseAnonKey);
  if(isTierVotingLockedByEvent(activeEv)) return {ok:false, reason:'event_locked'};
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
  // Uma só operação: debita, junta o item e regista. Se entretanto já o tivesse (outra aba) ou faltassem moedas, não cobra nada.
  const r = await purchaseCosmeticAtomic(supabaseUrl, supabaseAnonKey, name, won.id, LOOT_BOX_PRICE, `Caixa surpresa: ganhou ${won.name}`);
  if(!r.ok) return {ok:false, reason: r.reason === 'insufficient' ? 'insufficient' : 'error'};
  return {ok:true, item: won, category};
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

  if(net === 0){
    // Empate: o saldo não muda (antes isto dava "erro", porque o ajuste de 0 moedas era recusado) — só fica no histórico.
    await logCoinTransaction(supabaseUrl, supabaseAnonKey, name, 0, `Roleta: ${outcome.label}`);
    return {ok:true, outcome, payout};
  }
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
  // Cada grupo de conquistas faz as suas consultas à BD e só mexe em `earned` (um Set): são independentes, por
  // isso correm TODAS ao mesmo tempo (antes eram ~15 pedidos um a seguir ao outro — o perfil e as conquistas
  // esperavam a soma de todas as latências). O resultado é exatamente o mesmo.
  const tasks = [];

  tasks.push((async () => {
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
  })());

  tasks.push((async () => {
    try{
      // "ilike" (sem diferenciar maiúsculas/minúsculas) para apanhar tanto o texto
      // atual ("Jackpot 5x!") como o texto antigo de quando tínhamos o jackpot
      // progressivo ("JACKPOT PROGRESSIVO", em maiúsculas) — histórico incluído.
      const jackpotRes = await fetch(`${supabaseUrl}/rest/v1/coin_transactions?player_name=eq.${encodeURIComponent(name)}&reason=ilike.*jackpot*&select=id&limit=1`, {headers: sbAuthHeaders(supabaseAnonKey)});
      const jackpotRows = await jackpotRes.json();
      if(Array.isArray(jackpotRows) && jackpotRows.length >= 1) earned.add('lucky_strike');
    } catch(e){ /* ignora silenciosamente */ }
  })());

  tasks.push((async () => {
    try{
      // Voz do Povo: já venceu a votação de Apelido da Semana pelo menos uma vez
      // (procura no registo de auditoria, onde fica registado quando é apurado).
      const pattern = encodeURIComponent(`*de ${name} venceu a vota*`);
      const voiceRes = await fetch(`${supabaseUrl}/rest/v1/activity_log?category=eq.jogadores&action=ilike.${pattern}&select=id&limit=1`, {headers: sbAuthHeaders(supabaseAnonKey)});
      const voiceRows = await voiceRes.json();
      if(Array.isArray(voiceRows) && voiceRows.length >= 1) earned.add('voice_of_the_people');
    } catch(e){ /* ignora silenciosamente */ }
  })());

  tasks.push((async () => {
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
  })());

  tasks.push((async () => {
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
  })());

  tasks.push((async () => {
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
  })());

  tasks.push((async () => {
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
  })());

  tasks.push((async () => {
    try{
      // Voz Ativa: os votos de tier são apagados a cada torneio novo, por isso
      // conta-se a partir do registo de auditoria (permanente) em vez da
      // tabela de votos em si.
      const votePattern = encodeURIComponent('Votou*no tier*');
      const voteRes = await fetch(`${supabaseUrl}/rest/v1/activity_log?actor_name=eq.${encodeURIComponent(name)}&category=eq.loja&action=like.${votePattern}&select=id`, {headers: sbAuthHeaders(supabaseAnonKey)});
      const voteRows = await voteRes.json();
      if(Array.isArray(voteRows) && voteRows.length >= 5) earned.add('active_voice');
    } catch(e){ /* ignora silenciosamente */ }
  })());

  tasks.push((async () => {
    try{
      // Popular: recebeu presentes de pelo menos 3 jogadores diferentes.
      const giftsRecRes = await fetch(`${supabaseUrl}/rest/v1/gifts?to_name=eq.${encodeURIComponent(name)}&select=from_name`, {headers: sbAuthHeaders(supabaseAnonKey)});
      const giftsRecRows = await giftsRecRes.json();
      if(Array.isArray(giftsRecRows)){
        const distinctGivers = new Set(giftsRecRows.map(g=>g.from_name));
        if(distinctGivers.size >= 3) earned.add('popular');
      }
    } catch(e){ /* ignora silenciosamente */ }
  })());

  tasks.push((async () => {
    try{
      // Trocador Compulsivo: pediu reroll pelo menos 5 vezes (qualquer status).
      const rerollRes = await fetch(`${supabaseUrl}/rest/v1/reroll_requests?player_name=eq.${encodeURIComponent(name)}&select=id`, {headers: sbAuthHeaders(supabaseAnonKey)});
      const rerollRows = await rerollRes.json();
      if(Array.isArray(rerollRows) && rerollRows.length >= 5) earned.add('compulsive_rerolls');
    } catch(e){ /* ignora silenciosamente */ }
  })());

  tasks.push((async () => {
    try{
      // Leiloeiro: venceu pelo menos um leilão concluído.
      const auctionPattern = encodeURIComponent(`*${name}*`);
      const auctionRes = await fetch(`${supabaseUrl}/rest/v1/auctions?status=eq.concluded&winner_name=ilike.${auctionPattern}&select=id&limit=1`, {headers: sbAuthHeaders(supabaseAnonKey)});
      const auctionRows = await auctionRes.json();
      if(Array.isArray(auctionRows) && auctionRows.length >= 1) earned.add('auctioneer');
    } catch(e){ /* ignora silenciosamente */ }
  })());

  tasks.push((async () => {
    try{
      // Rei do Pote / Bilhete Dourado: precisa de olhar para as rodadas da
      // Loteria que este jogador venceu, e para cada uma, quantos bilhetes
      // tinha nessa rodada específica.
      const wonPattern = encodeURIComponent(`*${name}*`);
      const wonRoundsRes = await fetch(`${supabaseUrl}/rest/v1/lottery_rounds?status=eq.concluded&winner_name=ilike.${wonPattern}&select=id,pot`, {headers: sbAuthHeaders(supabaseAnonKey)});
      const wonRounds = await wonRoundsRes.json();
      if(Array.isArray(wonRounds) && wonRounds.length){
        if(wonRounds.some(r => (r.pot||0) >= 150)) earned.add('pot_king');

        const totals = await Promise.all(wonRounds.map(async round => {
          const ticketsRes = await fetch(`${supabaseUrl}/rest/v1/lottery_tickets?round_id=eq.${round.id}&buyer_name=eq.${encodeURIComponent(name)}&select=ticket_count`, {headers: sbAuthHeaders(supabaseAnonKey)});
          const ticketsRows = await ticketsRes.json();
          return Array.isArray(ticketsRows) ? ticketsRows.reduce((s,t)=>s+(t.ticket_count||0), 0) : 0;
        }));
        if(totals.some(t => t === 1)) earned.add('golden_ticket');
      }
    } catch(e){ /* ignora silenciosamente */ }
  })());

  await Promise.all(tasks);
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
// IDs só calculados dentro de computeAsyncAchievements() (precisam de
// consultas extra a outras tabelas — predictions, gifts, activity_log,
// reroll_requests, auctions, lottery_rounds, coin_transactions, etc). A
// função abaixo NUNCA as chama (custaria N jogadores × várias consultas só
// para um resumo), por isso a contagem destas seria sempre 0, mesmo que
// alguém as tenha mesmo — têm de ficar de fora da lista, não só escondidas
// se forem secretas. Se adicionar uma conquista nova a computeAsyncAchievements,
// junte o id aqui também.
const GLOBAL_STATS_UNCOUNTABLE_IDS = new Set([
  'sharp_bettor', 'lucky_streak_bettor', 'lucky_strike', 'voice_of_the_people',
  'philanthropist', 'recurring_giver', 'investor', 'no_fear', 'daily_starter',
  'daily_week', 'early_riser', 'daily_month_streak', 'night_owl', 'insomniac',
  'early_bird', 'active_voice', 'popular', 'compulsive_rerolls', 'auctioneer',
  'pot_king', 'golden_ticket'
]);

function computeGlobalAchievementStats(playerStats, allRows, playerProfiles){
  const bestStreaks = computeAllBestWinStreaks(allRows);
  const names = Object.keys(playerStats);
  const counts = {};
  ACHIEVEMENTS.forEach(a=>{ counts[a.id] = 0; });
  names.forEach(name=>{
    const earned = computeAchievements(playerStats[name], bestStreaks[name] || 0);
    computeMatchPathAchievements(name, allRows, playerProfiles ? playerProfiles[name] : null).forEach(id=>earned.add(id));
    earned.forEach(id=>{ counts[id] = (counts[id]||0) + 1; });
  });
  return ACHIEVEMENTS
    .filter(a => !GLOBAL_STATS_UNCOUNTABLE_IDS.has(a.id)) // fora as que nunca dá para contar certo aqui
    .map(a=>({
      ...a,
      count: counts[a.id] || 0,
      pct: names.length ? Math.round(((counts[a.id]||0) / names.length) * 100) : 0
    }))
    .filter(a => !a.secret || a.count > 0) // esconde secretas que ninguém desbloqueou ainda — mesma regra do resto do site
    .sort((a,b)=> a.pct - b.pct);
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
    // Primeiro reclama a aposta (marca-a como resolvida), só depois paga: dois jogadores a abrir a página ao mesmo
    // tempo já não pagam o prémio a dobrar — só quem conseguir marcar a aposta é que paga.
    if(!(await claimBetResolution(supabaseUrl, supabaseAnonKey, 'champion_bets', bet.id, correct))) continue;
    const payout = Math.round(bet.wager * bet.multiplier);
    if(correct && payout > 0){
      const paid = await adjustPlayerCoins(supabaseUrl, supabaseAnonKey, bet.predictor_name, payout, `Acertou o campeão da semana: ${bet.predicted_champion} (${bet.multiplier}x)`);
      if(!paid) await releaseBetResolution(supabaseUrl, supabaseAnonKey, 'champion_bets', bet.id); // volta a ficar pendente, tenta-se de novo
    }
  }
}

// Reclama a resolução de uma aposta (tabelas predictions / champion_bets): o PATCH só altera a linha se ainda estiver por
// resolver e devolve-a; só quem a recebe de volta (true) deve pagar o prémio.
async function claimBetResolution(supabaseUrl, supabaseAnonKey, table, id, correct){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}&resolved=eq.false`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=representation'}),
      body: JSON.stringify({ resolved:true, correct })
    });
    if(!res.ok) return false;
    const rows = await res.json();
    return !!(rows && rows.length);
  } catch(e){ return false; }
}
// Desfaz a reclamação se o pagamento falhou (a aposta volta a ficar pendente).
async function releaseBetResolution(supabaseUrl, supabaseAnonKey, table, id){
  try{
    await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({ resolved:false, correct:null })
    });
  } catch(e){ /* sem rede: fica por resolver e o organizador pode acertar à mão */ }
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
    const candidates = [...earnedSet].filter(id => !seen.has(id));
    if(!candidates.length) return [];
    // A base de dados regista as conquistas novas E paga o bónus numa só operação: se duas páginas estiverem abertas
    // ao mesmo tempo, só uma delas "ganha" cada conquista (antes o bónus podia ser pago a dobrar).
    const items = candidates.map(id => { const a = ACHIEVEMENTS.find(x=>x.id===id); return { id, name: a ? a.name : id }; });
    const r = await dbFunction(supabaseUrl, supabaseAnonKey, 'claim_new_achievements', { p_name:name, p_items:items, p_bonus:ACHIEVEMENT_COIN_BONUS });
    return (r.ok && Array.isArray(r.data)) ? r.data : [];
  } catch(e){
    return [];
  }
}

// ---------- Mensagens para o Discord a partir das páginas hospedadas ----------
// O jogador NÃO vê o link do webhook: pede à base de dados (função discord_notify) para enviar a mensagem. A base só envia texto simples (até 400
// caracteres, sem menções) e no máximo 6 mensagens por 10 minutos. Devolve true se a base aceitou a mensagem.
async function postToDiscordFromSite(supabaseUrl, supabaseAnonKey, payload){
  const text = typeof payload === 'string' ? payload : (payload && payload.content) || '';
  if(!text) return false;
  const r = await dbFunction(supabaseUrl, supabaseAnonKey, 'discord_notify', { p_text: text });
  return !!(r.ok && r.data && r.data.ok);
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

  const r = await purchaseCosmeticAtomic(supabaseUrl, supabaseAnonKey, name, item.id, item.discountedPrice,
    `Comprou "${item.name}" na Loja Rotativa (${WEEKLY_FEATURED_DISCOUNT_PCT}% de desconto)`);
  if(!r.ok) return {ok:false, reason: ['insufficient','alreadyowned'].includes(r.reason) ? r.reason : 'error'};
  return {ok:true};
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
      const houseCut = cost - potIncrease;
      await fetch(`${supabaseUrl}/rest/v1/lottery_rounds?id=eq.${roundId}`, {
        method:'PATCH',
        headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
        body: JSON.stringify({ pot: (roundRows[0].pot||0) + potIncrease, total_tickets: (roundRows[0].total_tickets||0) + count })
      });
      if(houseCut > 0) await addToHouseFund(supabaseUrl, supabaseAnonKey, houseCut);
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

// ---------- Fundo da Casa ----------
// Guarda o lucro acumulado da taxa de 10% da Loteria — em vez de simplesmente
// desaparecer, fica registado (para curiosidade) e disponível para ser
// devolvido de várias formas (aniversários, marcos, MVP).
const BIRTHDAY_FUND_SHARE_PCT = 20;   // fatia do fundo dada a cada aniversário de jogador
const MVP_FUND_SHARE_PCT = 15;         // fatia dada ao MVP a cada bloco de 3 torneios
const GROUP_ANNIVERSARY_BONUS = 20;    // moedas fixas por jogador no aniversário do grupo
const HOUSE_FUND_MILESTONE_STEP = 500; // celebra a cada 500 moedas acumuladas no total

async function fetchHouseFund(supabaseUrl, supabaseAnonKey){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/house_fund?id=eq.1&select=*`, {headers: sbAuthHeaders(supabaseAnonKey)});
    const rows = await res.json();
    return (rows && rows[0]) || { total_collected:0, current_balance:0, last_milestone:0 };
  } catch(e){
    return { total_collected:0, current_balance:0, last_milestone:0 };
  }
}

async function addToHouseFund(supabaseUrl, supabaseAnonKey, amount){
  try{
    const fund = await fetchHouseFund(supabaseUrl, supabaseAnonKey);
    await fetch(`${supabaseUrl}/rest/v1/house_fund?id=eq.1`, {
      method:'PATCH',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), {'Content-Type':'application/json','Prefer':'return=minimal'}),
      body: JSON.stringify({
        total_collected: (fund.total_collected||0) + amount,
        current_balance: (fund.current_balance||0) + amount
      })
    });
  } catch(e){ /* nao critico */ }
}

// Devolve o próximo marco (múltiplo de HOUSE_FUND_MILESTONE_STEP) que ainda
// não foi celebrado, ou null se o total atual ainda não o atingiu.
function computeNextUncelebratedMilestone(fund){
  const reached = Math.floor((fund.total_collected||0) / HOUSE_FUND_MILESTONE_STEP) * HOUSE_FUND_MILESTONE_STEP;
  if(reached > 0 && reached > (fund.last_milestone||0)) return reached;
  return null;
}

// ---------- Eventos: regiões por geração (evento "Volta ao Mundo") ----------
// Região = geração em que a ESPÉCIE foi introduzida (Pokédex Nacional 1–151 Kanto,
// 152–251 Johto, 252–386 Hoenn, 387–493 Sinnoh). Formas regionais/alternativas contam
// na geração da espécie base (ex.: Tauros-Paldea-Blaze = Kanto). Gerado uma vez a
// partir do pokedex do Pokémon Showdown. COPIADO À MÃO para torneio_showdown.html
// (o gestor não carrega este ficheiro) — manter as duas cópias iguais.
const EVENT_REGIONS = {
  kanto:  { label:'Kanto',  dex:'#1–151' },
  johto:  { label:'Johto',  dex:'#152–251' },
  hoenn:  { label:'Hoenn',  dex:'#252–386' },
  sinnoh: { label:'Sinnoh', dex:'#387–493' }
};
const EVENT_REGION_SPECIES = {
  kanto: 'Bulbasaur,Ivysaur,Venusaur,Charmander,Charmeleon,Charizard,Squirtle,Wartortle,Blastoise,Caterpie,Metapod,'
    + 'Butterfree,Weedle,Kakuna,Beedrill,Pidgey,Pidgeotto,Pidgeot,Rattata,Raticate,Spearow,Fearow,Ekans,Arbok,'
    + 'Pikachu,Raichu,Sandshrew,Sandslash,Nidoran-F,Nidorina,Nidoqueen,Nidoran-M,Nidorino,Nidoking,Clefairy,'
    + 'Clefable,Vulpix,Ninetales,Jigglypuff,Wigglytuff,Zubat,Golbat,Oddish,Gloom,Vileplume,Paras,Parasect,Venonat,'
    + 'Venomoth,Diglett,Dugtrio,Meowth,Persian,Psyduck,Golduck,Mankey,Primeape,Growlithe,Arcanine,Poliwag,'
    + 'Poliwhirl,Poliwrath,Abra,Kadabra,Alakazam,Machop,Machoke,Machamp,Bellsprout,Weepinbell,Victreebel,Tentacool,'
    + 'Tentacruel,Geodude,Graveler,Golem,Ponyta,Rapidash,Slowpoke,Slowbro,Magnemite,Magneton,Farfetch’d,Doduo,'
    + 'Dodrio,Seel,Dewgong,Grimer,Muk,Shellder,Cloyster,Gastly,Haunter,Gengar,Onix,Drowzee,Hypno,Krabby,Kingler,'
    + 'Voltorb,Electrode,Exeggcute,Exeggutor,Cubone,Marowak,Hitmonlee,Hitmonchan,Lickitung,Koffing,Weezing,Rhyhorn,'
    + 'Rhydon,Chansey,Tangela,Kangaskhan,Horsea,Seadra,Goldeen,Seaking,Staryu,Starmie,Mr. Mime,Scyther,Jynx,'
    + 'Electabuzz,Magmar,Pinsir,Tauros,Magikarp,Gyarados,Lapras,Ditto,Eevee,Vaporeon,Jolteon,Flareon,Porygon,'
    + 'Omanyte,Omastar,Kabuto,Kabutops,Aerodactyl,Snorlax,Articuno,Zapdos,Moltres,Dratini,Dragonair,Dragonite,'
    + 'Mewtwo,Mew',
  johto: 'Chikorita,Bayleef,Meganium,Cyndaquil,Quilava,Typhlosion,Totodile,Croconaw,Feraligatr,Sentret,Furret,'
    + 'Hoothoot,Noctowl,Ledyba,Ledian,Spinarak,Ariados,Crobat,Chinchou,Lanturn,Pichu,Cleffa,Igglybuff,Togepi,'
    + 'Togetic,Natu,Xatu,Mareep,Flaaffy,Ampharos,Bellossom,Marill,Azumarill,Sudowoodo,Politoed,Hoppip,Skiploom,'
    + 'Jumpluff,Aipom,Sunkern,Sunflora,Yanma,Wooper,Quagsire,Espeon,Umbreon,Murkrow,Slowking,Misdreavus,Unown,'
    + 'Wobbuffet,Girafarig,Pineco,Forretress,Dunsparce,Gligar,Steelix,Snubbull,Granbull,Qwilfish,Scizor,Shuckle,'
    + 'Heracross,Sneasel,Teddiursa,Ursaring,Slugma,Magcargo,Swinub,Piloswine,Corsola,Remoraid,Octillery,Delibird,'
    + 'Mantine,Skarmory,Houndour,Houndoom,Kingdra,Phanpy,Donphan,Porygon2,Stantler,Smeargle,Tyrogue,Hitmontop,'
    + 'Smoochum,Elekid,Magby,Miltank,Blissey,Raikou,Entei,Suicune,Larvitar,Pupitar,Tyranitar,Lugia,Ho-Oh,Celebi',
  hoenn: 'Treecko,Grovyle,Sceptile,Torchic,Combusken,Blaziken,Mudkip,Marshtomp,Swampert,Poochyena,Mightyena,Zigzagoon,'
    + 'Linoone,Wurmple,Silcoon,Beautifly,Cascoon,Dustox,Lotad,Lombre,Ludicolo,Seedot,Nuzleaf,Shiftry,Taillow,'
    + 'Swellow,Wingull,Pelipper,Ralts,Kirlia,Gardevoir,Surskit,Masquerain,Shroomish,Breloom,Slakoth,Vigoroth,'
    + 'Slaking,Nincada,Ninjask,Shedinja,Whismur,Loudred,Exploud,Makuhita,Hariyama,Azurill,Nosepass,Skitty,Delcatty,'
    + 'Sableye,Mawile,Aron,Lairon,Aggron,Meditite,Medicham,Electrike,Manectric,Plusle,Minun,Volbeat,Illumise,'
    + 'Roselia,Gulpin,Swalot,Carvanha,Sharpedo,Wailmer,Wailord,Numel,Camerupt,Torkoal,Spoink,Grumpig,Spinda,'
    + 'Trapinch,Vibrava,Flygon,Cacnea,Cacturne,Swablu,Altaria,Zangoose,Seviper,Lunatone,Solrock,Barboach,Whiscash,'
    + 'Corphish,Crawdaunt,Baltoy,Claydol,Lileep,Cradily,Anorith,Armaldo,Feebas,Milotic,Castform,Kecleon,Shuppet,'
    + 'Banette,Duskull,Dusclops,Tropius,Chimecho,Absol,Wynaut,Snorunt,Glalie,Spheal,Sealeo,Walrein,Clamperl,'
    + 'Huntail,Gorebyss,Relicanth,Luvdisc,Bagon,Shelgon,Salamence,Beldum,Metang,Metagross,Regirock,Regice,'
    + 'Registeel,Latias,Latios,Kyogre,Groudon,Rayquaza,Jirachi,Deoxys',
  sinnoh: 'Turtwig,Grotle,Torterra,Chimchar,Monferno,Infernape,Piplup,Prinplup,Empoleon,Starly,Staravia,Staraptor,'
    + 'Bidoof,Bibarel,Kricketot,Kricketune,Shinx,Luxio,Luxray,Budew,Roserade,Cranidos,Rampardos,Shieldon,Bastiodon,'
    + 'Burmy,Wormadam,Mothim,Combee,Vespiquen,Pachirisu,Buizel,Floatzel,Cherubi,Cherrim,Shellos,Gastrodon,Ambipom,'
    + 'Drifloon,Drifblim,Buneary,Lopunny,Mismagius,Honchkrow,Glameow,Purugly,Chingling,Stunky,Skuntank,Bronzor,'
    + 'Bronzong,Bonsly,Mime Jr.,Happiny,Chatot,Spiritomb,Gible,Gabite,Garchomp,Munchlax,Riolu,Lucario,Hippopotas,'
    + 'Hippowdon,Skorupi,Drapion,Croagunk,Toxicroak,Carnivine,Finneon,Lumineon,Mantyke,Snover,Abomasnow,Weavile,'
    + 'Magnezone,Lickilicky,Rhyperior,Tangrowth,Electivire,Magmortar,Togekiss,Yanmega,Leafeon,Glaceon,Gliscor,'
    + 'Mamoswine,Porygon-Z,Gallade,Probopass,Dusknoir,Froslass,Rotom,Uxie,Mesprit,Azelf,Dialga,Palkia,Heatran,'
    + 'Regigigas,Giratina,Cresselia,Phione,Manaphy,Darkrai,Shaymin,Arceus'
};
let _eventRegionIndex = null;
function eventSpeciesId(name){ return String(name||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
// Devolve 'kanto' | 'johto' | 'hoenn' | 'sinnoh', ou null se a espécie não pertence a
// nenhuma das 4 regiões. Tenta o nome inteiro (Ho-Oh, Porygon-Z, Nidoran-F...) e depois
// prefixos separados por hífen (Tauros-Paldea-Blaze -> Tauros) para apanhar as formas.
function getEventRegionOfSpecies(name){
  if(!_eventRegionIndex){
    _eventRegionIndex = {};
    Object.keys(EVENT_REGION_SPECIES).forEach(r=>{
      EVENT_REGION_SPECIES[r].split(',').forEach(nm=>{ if(nm) _eventRegionIndex[eventSpeciesId(nm)] = r; });
    });
  }
  const full = eventSpeciesId(name);
  if(_eventRegionIndex[full]) return _eventRegionIndex[full];
  const parts = String(name||'').split('-');
  for(let k = parts.length - 1; k >= 1; k--){
    const id = eventSpeciesId(parts.slice(0, k).join('-'));
    if(_eventRegionIndex[id]) return _eventRegionIndex[id];
  }
  return null;
}
function isSpeciesInEventRegion(name, region){ return getEventRegionOfSpecies(name) === region; }
// Nomes (como o Showdown os escreve) de todas as espécies base de uma região.
function getEventRegionSpeciesNames(region){
  return EVENT_REGION_SPECIES[region] ? EVENT_REGION_SPECIES[region].split(',') : [];
}

// Nas semanas de evento só vale a forma ORIGINAL da espécie: formas regionais
// (Alola, Galar, Hisui, Paldea — ex.: Tauros-Paldea-Aqua) e as variantes do Pikachu com
// boné (Pikachu-Hoenn, -Kalos...) ficam de fora. COPIADO À MÃO para torneio_showdown.html.
function isEventExcludedForme(name){
  const n = String(name || '');
  return /-(Alola|Galar|Hisui|Paldea)(-|$)/.test(n) || /^Pikachu-/.test(n);
}
// É esta espécie válida na região da semana? (região certa E forma original)
function isSpeciesAllowedInEventRegion(name, region){
  return getEventRegionOfSpecies(name) === region && !isEventExcludedForme(name);
}
// Tier gravado nos torneios de evento (próprio, para não contar como National Dex AG nas
// estatísticas, nem no ciclo de votação de tier). A pool de Pokémon é a da National Dex AG.
const EVENT_TIER_LABEL = 'Evento';

// Evento ativo (ou null). Devolve null também se a tabela `events` ainda não existir,
// para as páginas continuarem a funcionar antes de o SQL ser corrido.
async function fetchActiveEvent(supabaseUrl, supabaseAnonKey){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/events?status=eq.active&select=*&order=created_at.desc&limit=1`, {
      headers: sbAuthHeaders(supabaseAnonKey)
    });
    if(!res.ok) return null;
    const rows = await res.json();
    return rows && rows[0] ? rows[0] : null;
  } catch(e){ return null; }
}

// Enquanto um evento ativo ainda tiver semanas sem torneio criado, o tier da próxima semana
// é fixo (National Dex AG) — por isso a votação de tier (que custa moedas) fica bloqueada.
function isTierVotingLockedByEvent(ev){
  return !!(ev && ev.status === 'active' && ev.current_week < ev.total_weeks);
}

// ---------- Eventos: cosméticos, torneios do evento, botão de canto ----------
// Dá cosméticos a um jogador SEM os duplicar. Devolve {ok, added:[ids realmente novos]}.
// Atómico (função grant_cosmetics): não apaga uma compra feita ao mesmo tempo.
async function grantCosmetic(supabaseUrl, supabaseAnonKey, name, cosmeticIds){
  return grantCosmeticAtomic(supabaseUrl, supabaseAnonKey, name, cosmeticIds);
}

// Só os torneios de UM evento (filtro por data->event->>id no servidor), já só com os campos
// que as missões precisam — ~3 KB em vez dos ~16 KB do torneio completo (o `draws` é 88%).
// Devolve linhas no mesmo formato das outras páginas: {id, created_at, tier, status, data:{...}}.
async function fetchEventTournaments(supabaseUrl, supabaseAnonKey, eventId){
  try{
    const sel = 'id,created_at,tier,status,name:data-%3E%3Ename,event:data-%3Eevent,players:data-%3Eplayers,matches:data-%3Ematches,champion:data-%3E%3Echampion';
    const res = await fetch(`${supabaseUrl}/rest/v1/tournaments?data-%3Eevent-%3E%3Eid=eq.${encodeURIComponent(eventId)}&select=${sel}&order=created_at.asc`, {
      headers: sbAuthHeaders(supabaseAnonKey)
    });
    if(!res.ok) return [];
    const rows = await res.json();
    return (rows || []).map(r => ({
      id: r.id, created_at: r.created_at, tier: r.tier, status: r.status,
      data: { name: r.name, event: r.event, players: r.players || [], matches: r.matches || [], champion: r.champion || null }
    }));
  } catch(e){ return []; }
}

// Botão de canto "🌍" (como o do perfil e o da recompensa diária) que abre a página do
// evento. Só aparece enquanto houver um evento ativo. Chamar depois de #playerCornerContainer existir.
async function mountEventCornerIcon(supabaseUrl, supabaseAnonKey){
  try{
    const container = document.getElementById('playerCornerContainer');
    if(!container || document.getElementById('eventCornerIcon')) return;
    const ev = await fetchActiveEvent(supabaseUrl, supabaseAnonKey);
    if(!ev || document.getElementById('eventCornerIcon')) return;
    const week = ev.current_week > 0 ? ` — Semana ${ev.current_week} de ${ev.total_weeks}` : ' — começa em breve';
    const title = `Evento: ${ev.name}${week}`.replace(/"/g, '&quot;');
    container.insertAdjacentHTML('beforeend', `<a href="eventos.html" id="eventCornerIcon" class="event-corner-icon" title="${title}">🌍</a>`);
    // Bolinha vermelha: desafio x1 por responder ou resultado por confirmar (nome lido do login guardado).
    const me = localStorage.getItem('player_login_name');
    if(me){
      const n = await countEventX1Alerts(supabaseUrl, supabaseAnonKey, ev.id, me);
      const icon = document.getElementById('eventCornerIcon');
      if(n > 0 && icon){
        icon.classList.add('has-alert');
        icon.title = `${title} — ${n} desafio${n === 1 ? '' : 's'} x1 à tua espera`.replace(/"/g, '&quot;');
      }
    }
  } catch(e){ /* não crítico */ }
}

// Quantos x1 estão à espera DESTE jogador: desafios recebidos por responder (pending) + resultados que
// o outro registou e que ele ainda não confirmou (reported, reported_by != ele). 0 se a tabela não existir.
async function countEventX1Alerts(supabaseUrl, supabaseAnonKey, eventId, name){
  try{
    const e = encodeURIComponent, h = { headers: sbAuthHeaders(supabaseAnonKey) };
    const base = `${supabaseUrl}/rest/v1/x1_challenges?event_id=eq.${e(eventId)}&select=status,reported_by`;
    const [a, b] = await Promise.all([
      fetch(`${base}&opponent_name=eq.${e(name)}&status=in.(pending,reported)`, h),
      fetch(`${base}&challenger_name=eq.${e(name)}&status=eq.reported`, h)
    ]);
    if(!a.ok || !b.ok) return 0;
    const rows = (await a.json()).concat(await b.json());
    return rows.filter(r => r.status === 'pending' || (r.status === 'reported' && r.reported_by !== name)).length;
  } catch(e){ return 0; }
}

// ---------- Escolha livre: lista de Pokémon para os jogadores escolherem (viewer.html) ----------
// COPIADO À MÃO de torneio_showdown.html (o gestor não carrega este ficheiro): SPECIES_CLAUSE_EXCEPTIONS e
// getBaseSpecies. A "espécie base" é tudo antes do 1.º hífen (Tauros-Paldea-Blaze -> Tauros), com exceções onde o
// hífen faz parte do nome. Duas formas da mesma espécie não podem estar no mesmo time.
const SPECIES_CLAUSE_EXCEPTIONS = {
  'Porygon-Z': 'Porygon-Z',
  'Ho-Oh': 'Ho-Oh',
  'Jangmo-o': 'Jangmo-o',
  'Hakamo-o': 'Hakamo-o',
  'Kommo-o': 'Kommo-o'
};
function getBaseSpecies(name){
  if(SPECIES_CLAUSE_EXCEPTIONS[name]) return SPECIES_CLAUSE_EXCEPTIONS[name];
  const idx = name.indexOf('-');
  return idx === -1 ? name : name.slice(0, idx);
}

// Pools de Pokémon por tier (só nomes) — dados/tier-pools.json, gerado a partir do TIER_DATA do gestor.
// Devolve { pools:{tier:[nomes]}, alias:{tier:outroTier} } ou null se o ficheiro não carregar.
let _tierPoolsPromise = null;
function fetchTierPools(){
  if(!_tierPoolsPromise){
    _tierPoolsPromise = fetch('dados/tier-pools.json').then(r => r.ok ? r.json() : null).catch(() => null);
  }
  return _tierPoolsPromise;
}

// Nomes entre os quais se pode escolher uma escolha livre. Torneio de evento: espécies da região da semana (só a
// forma original, como no gestor); torneio normal: a pool legal do tier. null = não há lista (não carregou).
function freePickCandidates(pools, tier, eventInfo){
  if(eventInfo && eventInfo.region){
    return getEventRegionSpeciesNames(eventInfo.region).filter(n => isSpeciesAllowedInEventRegion(n, eventInfo.region));
  }
  if(!pools || !pools.pools) return null;
  const key = (pools.alias && pools.alias[tier]) || tier;
  return pools.pools[key] || null;
}

// Para cada nome: {state:'ok'} | {state:'taken', by, how:'random'|'free'} (de OUTRO jogador) |
// {state:'own', how, species:true|undefined} (já está no time deste jogador, exato ou a mesma espécie).
// Mesmas regras do gestor (revalidateAllFreePicks): nome exato único em todo o torneio; uma espécie por time.
// `draws` = data.draws (índice do jogador -> {random:[{mon}], free:[{name}]}); slotIdx = escolha livre a trocar.
function freePickAvailability(draws, players, pIdx, slotIdx, names){
  const taken = {}, ownSpecies = {};
  Object.keys(draws || {}).forEach(k => {
    const d = draws[k] || {}, who = players[+k], mine = String(k) === String(pIdx);
    (d.random || []).forEach(r => {
      if(!r || !r.mon) return;
      taken[r.mon.toLowerCase()] = { by: who, how: 'random' };
      if(mine) ownSpecies[getBaseSpecies(r.mon)] = 'random';
    });
    (d.free || []).forEach((f, i) => {
      if(!f || !f.name || (mine && i === slotIdx)) return;   // a escolha que se está a trocar não conta
      taken[f.name.toLowerCase()] = { by: who, how: 'free' };
      if(mine) ownSpecies[getBaseSpecies(f.name)] = 'free';
    });
  });
  const me = players[pIdx], out = {};
  names.forEach(n => {
    const t = taken[n.toLowerCase()];
    if(t) out[n] = t.by === me ? { state:'own', how:t.how } : { state:'taken', by:t.by, how:t.how };
    else if(ownSpecies[getBaseSpecies(n)]) out[n] = { state:'own', how:ownSpecies[getBaseSpecies(n)], species:true };
    else out[n] = { state:'ok' };
  });
  return out;
}

// ---------- Mural de comentários nos perfis ----------
// Cada jogador pode deixar UM comentário por dia no perfil de cada outro (unique target+autor+dia na BD). O autor e o
// dono do perfil apagam; o organizador modera no gestor. Sem moedas nem XP (para não haver farming). Se a tabela
// ainda não existir (SQL por correr) as funções devolvem {available:false} e o perfil continua a funcionar.
const PROFILE_COMMENT_MAX = 200;
function profileCommentDay(){ return new Date().toISOString().slice(0, 10); }   // dia UTC, como o bónus diário e o quadro do evento

async function fetchProfileComments(supabaseUrl, supabaseAnonKey, targetName){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/profile_comments?target_name=eq.${encodeURIComponent(targetName)}&select=id,created_at,author_name,body,day&order=created_at.desc&limit=100`, { headers: sbAuthHeaders(supabaseAnonKey) });
    if(!res.ok) return { available:false, rows:[] };
    return { available:true, rows: await res.json() };
  } catch(e){ return { available:false, rows:[] }; }
}

// Devolve {ok} ou {ok:false, reason:'empty'|'toolong'|'self'|'already'|'unavailable'|'error'}
async function postProfileComment(supabaseUrl, supabaseAnonKey, targetName, authorName, text){
  const body = String(text || '').replace(/\s+/g, ' ').trim();
  if(!body) return { ok:false, reason:'empty' };
  if(body.length > PROFILE_COMMENT_MAX) return { ok:false, reason:'toolong' };
  if(!targetName || !authorName || targetName === authorName) return { ok:false, reason:'self' };
  let res;
  try{
    res = await fetch(`${supabaseUrl}/rest/v1/profile_comments`, {
      method:'POST',
      headers: Object.assign(sbAuthHeaders(supabaseAnonKey), { 'Content-Type':'application/json', 'Prefer':'return=minimal' }),
      body: JSON.stringify([{ target_name: targetName, author_name: authorName, body, day: profileCommentDay() }])
    });
  } catch(e){ return { ok:false, reason:'error' }; }
  if(res.status === 409) return { ok:false, reason:'already' };
  if(res.status === 404) return { ok:false, reason:'unavailable' };
  if(!res.ok) return { ok:false, reason:'error' };
  logActivity(supabaseUrl, supabaseAnonKey, 'jogador', authorName, 'perfil', `Comentou no perfil de ${targetName}`);
  return { ok:true };
}

async function deleteProfileComment(supabaseUrl, supabaseAnonKey, id){
  try{
    const res = await fetch(`${supabaseUrl}/rest/v1/profile_comments?id=eq.${encodeURIComponent(id)}`, { method:'DELETE', headers: sbAuthHeaders(supabaseAnonKey) });
    return res.ok;
  } catch(e){ return false; }
}

// ---------- Leitura leve dos torneios ----------
// Os torneios guardam os sorteios (`draws`: os sets importados) no mesmo JSON dos resultados, e isso é ~85 % do peso
// (hoje ~84 KB de 99 KB, a crescer ~14 KB por torneio). As páginas que só precisam de RESULTADOS (conquistas, loja...)
// leem só os campos pequenos. Devolve linhas no formato de sempre: { id, tier, status, created_at, data:{...} }.
// NÃO usar onde se precisa dos sorteios — aí `data.draws` não existe. Dependem dos sorteios: aggregatePlayerPokemon,
// aggregateNicknames, computeMatchPathAchievements ("Nomeador Criativo") e por isso computeAllAchievements,
// computeGlobalAchievementStats e computeIconicTeam (estatísticas, hall da fama, perfil, conquistas, viewer).
// Hoje só a loja usa esta leitura (só precisa de tier/estado dos torneios). Testado contra os dados reais.
async function fetchTournamentRowsLite(supabaseUrl, supabaseAnonKey){
  const cols = 'id,tier,status,created_at,featured_match_title,featured_match_replay_path,'
    + 'd_name:data->name,d_tier:data->tier,d_players:data->players,d_matches:data->matches,d_champion:data->champion,d_event:data->event,d_double:data->doubleElim';
  const res = await fetch(`${supabaseUrl}/rest/v1/tournaments?select=${cols}&order=created_at.desc`, { headers: sbAuthHeaders(supabaseAnonKey) });
  if(!res.ok) throw new Error('HTTP ' + res.status);
  return (await res.json()).map(r => ({
    id: r.id, tier: r.tier, status: r.status, created_at: r.created_at,
    featured_match_title: r.featured_match_title, featured_match_replay_path: r.featured_match_replay_path,
    data: { name: r.d_name, tier: r.d_tier, players: r.d_players || [], matches: r.d_matches || [], champion: r.d_champion || null, event: r.d_event || undefined, doubleElim: r.d_double || undefined }
  }));
}

