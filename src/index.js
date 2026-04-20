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
    
    // Setup webhook
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

// Handle all Telegram updates
async function handleTelegramUpdate(update, env) {
  // Handle messages
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const userId = msg.from.id;
    const username = msg.from.username || '';
    const firstName = msg.from.first_name || '';
    
    // Check if user is admin
    const adminIds = env.ADMIN_IDS ? env.ADMIN_IDS.split(',') : [];
    const isAdmin = adminIds.includes(userId.toString());
    
    // Register or get user
    await registerUser(env, userId, username, firstName, isAdmin);
    
    // /start command
    if (text === '/start') {
      if (isAdmin) {
        await sendMessage(env, chatId, '🎵 Welcome Admin!\n\nCommands:\n/addtrack - Add a new track\n/addartist - Add a new artist\n/addalbum - Add a new album\n/stats - View stats\n/help - Show all commands');
      } else {
        await sendMessage(env, chatId, '🎵 Welcome to Zambian Music Updates Bot!\n\nRequest music in the group and I will deliver it here.');
      }
      return;
    }
    
    // /help command
    if (text === '/help') {
      if (isAdmin) {
        await sendMessage(env, chatId, '📖 Admin Commands:\n\n/addtrack - Upload audio + set artist/title\n/addartist - Add new artist name\n/addalbum - Create album with tracks\n/stats - Show total tracks, artists, albums\n/cancel - Cancel current operation');
      } else {
        await sendMessage(env, chatId, '📖 How to use:\n\n1. Request songs in the group\n2. Bot will send them here\n3. Enjoy music!');
      }
      return;
    }
    
    // /addtrack command (admin only)
    if (text === '/addtrack' && isAdmin) {
      // Store admin state (simplified for now)
      await sendMessage(env, chatId, '📝 Send me the AUDIO file.\n\nI will ask for artist and title after.');
      return;
    }
    
    // Handle audio file upload
    if (msg.audio && isAdmin) {
      await handleAudioUpload(msg, env, userId);
      return;
    }
    
    // /stats command (admin only)
    if (text === '/stats' && isAdmin) {
      await showStats(env, chatId);
      return;
    }
    
    // Unknown command
    if (text && text.startsWith('/')) {
      await sendMessage(env, chatId, '❓ Unknown command. Send /help for available commands.');
    }
  }
}

// Register user in database
async function registerUser(env, tgId, username, firstName, isAdmin) {
  const db = env.DB;
  
  await db.prepare(`
    INSERT OR IGNORE INTO users (tg_id, username, first_name, is_admin)
    VALUES (?, ?, ?, ?)
  `).bind(tgId.toString(), username || '', firstName || '', isAdmin ? 1 : 0).run();
}

// Handle audio upload from admin
async function handleAudioUpload(msg, env, adminId) {
  const chatId = msg.chat.id;
  const audio = msg.audio;
  const fileId = audio.file_id;
  const fileName = audio.file_name || 'audio.mp3';
  const duration = audio.duration;
  
  const channelId = env.PRIVATE_CHANNEL_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  
  try {
    // Forward to private channel
    const forwardResponse = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        audio: fileId,
        caption: `📀 ${fileName}\n👤 Admin ID: ${adminId}\n📅 ${new Date().toISOString()}`
      })
    });
    
    const forwardResult = await forwardResponse.json();
    
    if (forwardResult.ok) {
      const permanentFileId = forwardResult.result.audio.file_id;
      
      // Store in database (artist and title will be added later)
      const db = env.DB;
      await db.prepare(`
        INSERT INTO tracks (file_id, title, artist_id, duration)
        VALUES (?, ?, ?, ?)
      `).bind(permanentFileId, fileName, 1, duration).run(); // artist_id 1 = placeholder
      
      await sendMessage(env, chatId, `✅ Audio saved!\n\n📀 ${fileName}\n⏱️ ${duration} seconds\n\nNow use:\n/setartist [artist name]\n/settitle [song title]\n\nOr send another audio.`);
    } else {
      await sendMessage(env, chatId, '❌ Failed to save. Make sure bot is admin in private channel.');
    }
  } catch (error) {
    console.error('Upload error:', error);
    await sendMessage(env, chatId, '❌ Error saving track.');
  }
}

// Show statistics
async function showStats(env, chatId) {
  const db = env.DB;
  
  // Get track count
  const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks').first();
  
  // Get artist count
  const artistCount = await db.prepare('SELECT COUNT(*) as count FROM artists').first();
  
  // Get album count
  const albumCount = await db.prepare('SELECT COUNT(*) as count FROM albums').first();
  
  // Get pending requests
  const pendingRequests = await db.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'pending'").first();
  
  await sendMessage(env, chatId, `📊 STATISTICS\n\n🎵 Tracks: ${trackCount?.count || 0}\n🎤 Artists: ${artistCount?.count || 0}\n💿 Albums: ${albumCount?.count || 0}\n⏳ Pending requests: ${pendingRequests?.count || 0}`);
}

// Helper: Send message
async function sendMessage(env, chatId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });
}