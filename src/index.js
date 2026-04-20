// Single file bot - Zambian Music Updates
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (path === '/') {
      return new Response('✅ Zambian Music Bot is running!', {
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    if (path === '/webhook' && request.method === 'POST') {
      const update = await request.json();
      await handleUpdate(update, env);
      return new Response('OK');
    }
    
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

// Store pending actions
const pending = new Map();

async function handleUpdate(update, env) {
  if (!update.message) return;
  
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const userId = msg.from.id.toString();
  
  // Check admin
  const adminIds = env.ADMIN_IDS ? env.ADMIN_IDS.split(',') : [];
  const isAdmin = adminIds.includes(userId);
  
  if (!isAdmin) {
    await sendMessage(env, chatId, 'You are not authorized to use this bot.');
    return;
  }
  
  // Handle /start
  if (text === '/start') {
    await sendMessage(env, chatId, '🎵 Admin Menu\n\n/addartist - Add artist\n/addalbum - Add album\n/listartists - Show artists');
    return;
  }
  
  // Handle /addartist
  if (text === '/addartist') {
    pending.set(userId, { step: 'artist_name' });
    await sendMessage(env, chatId, 'Send me the ARTIST NAME:');
    return;
  }
  
  // Handle /addalbum
  if (text === '/addalbum') {
    const db = env.DB;
    const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
    
    if (!artists.results || artists.results.length === 0) {
      await sendMessage(env, chatId, 'No artists. Use /addartist first.');
      return;
    }
    
    let list = 'Select artist by number:\n\n';
    for (let i = 0; i < artists.results.length; i++) {
      list += `${i + 1}. ${artists.results[i].name}\n`;
    }
    
    pending.set(userId, { 
      step: 'album_artist', 
      artists: artists.results 
    });
    await sendMessage(env, chatId, list);
    return;
  }
  
  // Handle /listartists
  if (text === '/listartists') {
    const db = env.DB;
    const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
    
    if (!artists.results || artists.results.length === 0) {
      await sendMessage(env, chatId, 'No artists yet.');
      return;
    }
    
    let list = '🎤 ARTISTS:\n\n';
    for (const artist of artists.results) {
      list += `• ${artist.name}\n`;
    }
    await sendMessage(env, chatId, list);
    return;
  }
  
  // Handle pending steps
  if (pending.has(userId)) {
    const action = pending.get(userId);
    
    // Add artist - waiting for name
    if (action.step === 'artist_name') {
      const artistName = text.trim();
      const db = env.DB;
      
      try {
        await db.prepare('INSERT INTO artists (name) VALUES (?)').bind(artistName).run();
        await sendMessage(env, chatId, `✅ Artist "${artistName}" added!`);
      } catch (error) {
        await sendMessage(env, chatId, `❌ Error: ${error.message}`);
      }
      
      pending.delete(userId);
      return;
    }
    
    // Add album - waiting for artist selection
    if (action.step === 'album_artist') {
      const choice = parseInt(text);
      const artists = action.artists;
      
      if (isNaN(choice) || choice < 1 || choice > artists.length) {
        await sendMessage(env, chatId, `Send number between 1 and ${artists.length}`);
        return;
      }
      
      const selected = artists[choice - 1];
      
      pending.set(userId, {
        step: 'album_name',
        artistId: selected.id,
        artistName: selected.name
      });
      
      await sendMessage(env, chatId, `Selected: ${selected.name}\n\nSend ALBUM NAME:`);
      return;
    }
    
    // Add album - waiting for album name
    if (action.step === 'album_name') {
      const albumName = text.trim();
      const db = env.DB;
      
      try {
        await db.prepare('INSERT INTO albums (name, artist_id) VALUES (?, ?)').bind(albumName, action.artistId).run();
        await sendMessage(env, chatId, `✅ Album "${albumName}" added to ${action.artistName}!`);
      } catch (error) {
        await sendMessage(env, chatId, `❌ Error: ${error.message}`);
      }
      
      pending.delete(userId);
      return;
    }
  }
  
  // Unknown command
  await sendMessage(env, chatId, 'Unknown command. Send /start for menu.');
}

async function sendMessage(env, chatId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
  } catch (error) {
    console.error('Send error:', error);
  }
}