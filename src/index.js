export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (path === '/') {
      return new Response('Bot is alive! 🟢');
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
      return new Response(JSON.stringify(result, null, 2));
    }
    
    return new Response('Not found', { status: 404 });
  }
};

async function handleUpdate(update, env) {
  if (!update.message) return;
  
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const userId = msg.from.id.toString();
  const username = msg.from.username || '';
  const firstName = msg.from.first_name || '';
  const messageId = msg.message_id;
  
  const adminIds = env.ADMIN_IDS ? env.ADMIN_IDS.split(',') : [];
  const isAdmin = adminIds.includes(userId);
  const isGroup = chatId.toString().startsWith('-');
  
  // Private messages
  if (!isGroup) {
    if (text === '/start') {
      if (isAdmin) {
        await replyToMessage(env, chatId, messageId, '🎵 Admin Menu\n\n/listalbums - Show albums\n/listartists - Show artists\n/stats - Statistics');
      } else {
        await replyToMessage(env, chatId, messageId, '🎵 Request music in the group!\n\nJust type your request naturally.');
      }
      return;
    }
    
    if (isAdmin && text === '/listalbums') {
      await listAlbums(env, chatId, messageId);
      return;
    }
    
    if (isAdmin && text === '/listartists') {
      await listArtists(env, chatId, messageId);
      return;
    }
    
    if (isAdmin && text === '/stats') {
      await showStats(env, chatId, messageId);
      return;
    }
    
    return;
  }
  
  // Group messages - use AI to detect requests
  if (isGroup && !isAdmin && text) {
    // Show typing indicator
    await sendChatAction(env, chatId);
    
    try {
      // Use Workers AI binding - env.AI is available from the binding [citation:3]
      const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: 'You extract artist and album names from music requests. Respond ONLY with JSON: {"artist": "artist name", "album": "album name"}. If missing, use "unknown".'
          },
          {
            role: 'user',
            content: text
          }
        ]
      });
      
      // Parse AI response
      let artist = "unknown";
      let album = "unknown";
      
      try {
        const parsed = JSON.parse(aiResponse.response);
        artist = parsed.artist || "unknown";
        album = parsed.album || "unknown";
      } catch (e) {
        // Fallback parsing
        const lines = aiResponse.response.split('\n');
        for (const line of lines) {
          if (line.includes('"artist"')) {
            const match = line.match(/"artist":\s*"([^"]+)"/);
            if (match) artist = match[1];
          }
          if (line.includes('"album"')) {
            const match = line.match(/"album":\s*"([^"]+)"/);
            if (match) album = match[1];
          }
        }
      }
      
      if (artist !== "unknown") {
        await addRequestToQueue(env, chatId, messageId, userId, username, firstName, artist, album);
      } else {
        await replyToMessage(env, chatId, messageId, `🤔 I couldn't understand your request.\n\nTry: "I want Artist - Album"`);
      }
    } catch (error) {
      console.error('AI error:', error);
      await replyToMessage(env, chatId, messageId, `❌ AI service error. Please use format: I want Artist - Album`);
    }
    return;
  }
}

async function addRequestToQueue(env, groupId, replyToMsgId, userId, username, firstName, artist, albumName) {
  const db = env.DB;
  
  // Check if requests table exists, create if not
  try {
    await db.prepare("SELECT 1 FROM requests LIMIT 1").run();
  } catch (e) {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_tg_id TEXT NOT NULL,
        user_name TEXT,
        artist TEXT,
        album_name TEXT,
        queue_number INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  }
  
  const pendingCount = await db.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'pending'").first();
  const queueNumber = (pendingCount?.count || 0) + 1;
  
  await db.prepare(`
    INSERT INTO requests (user_tg_id, user_name, artist, album_name, queue_number, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).bind(userId, username || firstName, artist, albumName, queueNumber).run();
  
  const displayName = username ? `@${username}` : firstName;
  await replyToMessage(env, groupId, replyToMsgId, `✅ Request #${queueNumber} received from ${displayName}!\n\n🎤 Artist: ${artist}\n💿 Album: ${albumName}\n\n⏳ Queue position: ${queueNumber}`);
}

async function listAlbums(env, chatId, replyToMsgId) {
  const db = env.DB;
  
  const albums = await db.prepare(`
    SELECT albums.id, albums.name, artists.name as artist_name,
           COUNT(tracks.id) as track_count
    FROM albums
    JOIN artists ON albums.artist_id = artists.id
    LEFT JOIN tracks ON tracks.album_id = albums.id
    GROUP BY albums.id
    ORDER BY albums.id
  `).all();
  
  if (!albums.results || albums.results.length === 0) {
    await replyToMessage(env, chatId, replyToMsgId, 'No albums yet.');
    return;
  }
  
  let list = '💿 ALBUMS:\n\n';
  for (const album of albums.results) {
    list += `ID: ${album.id} | ${album.artist_name} - ${album.name} (${album.track_count} tracks)\n`;
  }
  
  await replyToMessage(env, chatId, replyToMsgId, list);
}

async function listArtists(env, chatId, replyToMsgId) {
  const db = env.DB;
  
  const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
  
  if (!artists.results || artists.results.length === 0) {
    await replyToMessage(env, chatId, replyToMsgId, 'No artists yet.');
    return;
  }
  
  let list = '🎤 ARTISTS:\n\n';
  for (const artist of artists.results) {
    list += `• ${artist.name}\n`;
  }
  
  await replyToMessage(env, chatId, replyToMsgId, list);
}

async function showStats(env, chatId, replyToMsgId) {
  const db = env.DB;
  
  const artistCount = await db.prepare('SELECT COUNT(*) as count FROM artists').first();
  const albumCount = await db.prepare('SELECT COUNT(*) as count FROM albums').first();
  const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks').first();
  const pendingCount = await db.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'pending'").first();
  
  await replyToMessage(env, chatId, replyToMsgId, `📊 STATS\n\n🎤 Artists: ${artistCount?.count || 0}\n💿 Albums: ${albumCount?.count || 0}\n🎵 Tracks: ${trackCount?.count || 0}\n⏳ Pending: ${pendingCount?.count || 0}`);
}

async function sendChatAction(env, chatId) {
  const token = env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' })
  });
}

async function replyToMessage(env, chatId, replyToMessageId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_to_message_id: replyToMessageId
    })
  });
}