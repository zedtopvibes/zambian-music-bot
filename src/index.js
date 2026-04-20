// Zambian Music Updates Bot - Cloudflare Worker

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Homepage
    if (path === '/') {
      return new Response('✅ Zambian Music Bot is running!', {
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // Telegram webhook
    if (path === '/webhook' && request.method === 'POST') {
      const update = await request.json();
      await handleTelegramUpdate(update, env);
      return new Response('OK');
    }
    
    // Setup webhook (visit once)
    if (path === '/setup') {
      const webhookUrl = `https://${url.hostname}/webhook`;
      const token = env.TELEGRAM_BOT_TOKEN;
      
      const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });
      
      const result = await response.json();
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not found', { status: 404 });
  }
};

// Store pending admin actions (simple in-memory)
const pendingActions = new Map();

async function handleTelegramUpdate(update, env) {
  // Handle messages
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const userId = msg.from.id.toString();
    const username = msg.from.username || '';
    const firstName = msg.from.first_name || '';
    
    // Check if user is admin
    const adminIds = env.ADMIN_IDS ? env.ADMIN_IDS.split(',') : [];
    const isAdmin = adminIds.includes(userId);
    
    // Register user in database
    await registerUser(env, userId, username, firstName, isAdmin);
    
    // Handle commands
    if (text === '/start') {
      if (isAdmin) {
        await sendMessage(env, chatId, '🎵 Admin Menu\n\n/addartist - Add new artist\n/listartists - Show all artists\n/addalbum - Add album\n/addtrack - Upload track\n/stats - Show statistics');
      } else {
        await sendMessage(env, chatId, '🎵 Welcome to Zambian Music Updates!\n\nRequest songs in the group and I will deliver them here.');
      }
      return;
    }
    
    if (text === '/addartist' && isAdmin) {
      pendingActions.set(userId, { step: 'waiting_artist_name' });
      await sendMessage(env, chatId, 'Send me the ARTIST NAME.\n\nExample: Michael Jackson');
      return;
    }
    
    if (text === '/listartists' && isAdmin) {
      await listArtists(env, chatId);
      return;
    }
    
    if (text === '/stats' && isAdmin) {
      await showStats(env, chatId);
      return;
    }
    
    if (text === '/cancel' && isAdmin) {
      pendingActions.delete(userId);
      await sendMessage(env, chatId, 'Operation cancelled.');
      return;
    }
    
    // Handle pending steps
    if (pendingActions.has(userId)) {
      await handlePendingStep(env, chatId, userId, text, msg);
      return;
    }
    
    // Unknown command
    if (text.startsWith('/')) {
      await sendMessage(env, chatId, 'Unknown command. Send /start for help.');
    }
  }
}

async function handlePendingStep(env, chatId, userId, text, msg) {
  const action = pendingActions.get(userId);
  
  // Step: Waiting for artist name
  if (action.step === 'waiting_artist_name') {
    const artistName = text.trim();
    
    if (!artistName) {
      await sendMessage(env, chatId, 'Please send a valid artist name.');
      return;
    }
    
    const db = env.DB;
    
    try {
      await db.prepare('INSERT INTO artists (name) VALUES (?)').bind(artistName).run();
      await sendMessage(env, chatId, `✅ Artist "${artistName}" added!\n\nUse /addalbum to add albums or /addtrack to upload songs.`);
    } catch (error) {
      if (error.message.includes('UNIQUE')) {
        await sendMessage(env, chatId, `❌ Artist "${artistName}" already exists.`);
      } else {
        await sendMessage(env, chatId, `❌ Error: ${error.message}`);
      }
    }
    
    pendingActions.delete(userId);
    return;
  }
  
  pendingActions.delete(userId);
}

async function listArtists(env, chatId) {
  const db = env.DB;
  const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
  
  if (!artists.results || artists.results.length === 0) {
    await sendMessage(env, chatId, 'No artists yet. Use /addartist to add one.');
    return;
  }
  
  let message = '🎤 ARTISTS:\n\n';
  for (const artist of artists.results) {
    const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks WHERE artist_id = ?').bind(artist.id).first();
    message += `• ${artist.name} (${trackCount?.count || 0} songs)\n`;
  }
  
  await sendMessage(env, chatId, message);
}

async function showStats(env, chatId) {
  const db = env.DB;
  
  const artistCount = await db.prepare('SELECT COUNT(*) as count FROM artists').first();
  const albumCount = await db.prepare('SELECT COUNT(*) as count FROM albums').first();
  const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks').first();
  
  await sendMessage(env, chatId, `📊 STATISTICS\n\n🎤 Artists: ${artistCount?.count || 0}\n💿 Albums: ${albumCount?.count || 0}\n🎵 Tracks: ${trackCount?.count || 0}`);
}

async function registerUser(env, tgId, username, firstName, isAdmin) {
  const db = env.DB;
  
  await db.prepare(`
    INSERT OR IGNORE INTO users (tg_id, username, first_name, is_admin)
    VALUES (?, ?, ?, ?)
  `).bind(tgId, username || '', firstName || '', isAdmin ? 1 : 0).run();
}

async function sendMessage(env, chatId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
  } catch (error) {
    console.error('Send message error:', error);
  }
}