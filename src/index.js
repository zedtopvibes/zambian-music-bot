export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (path === '/') {
      return new Response('Bot is alive! 🟢', {
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
  
  // Check if this is a group message
  const isGroup = chatId.toString().startsWith('-');
  
  // Handle private messages (admin commands)
  if (!isGroup) {
    if (text === '/start') {
      if (isAdmin) {
        await replyToMessage(env, chatId, messageId, '🎵 Admin Menu\n\n/addartist - Add artist\n/addalbum - Add album\n/multitrack - Bulk upload\n/pending - Show pending requests\n/clear [number] [album_id] - Clear request\n/listartists - Show artists\n/listalbums - Show albums\n/stats - Statistics');
      } else {
        await replyToMessage(env, chatId, messageId, '🎵 Welcome! Request music in the group by typing:\n\nI want Artist - Album');
      }
      return;
    }
    
    // Admin commands
    if (isAdmin) {
      if (text === '/pending') {
        await showPendingRequests(env, chatId, messageId);
        return;
      }
      
      if (text.startsWith('/clear')) {
        const parts = text.split(' ');
        if (parts.length >= 3) {
          const requestNumber = parseInt(parts[1]);
          const albumId = parts[2];
          await clearRequest(env, chatId, messageId, requestNumber, albumId);
        } else {
          await replyToMessage(env, chatId, messageId, 'Usage: /clear [request_number] [album_id]\n\nExample: /clear 1 5');
        }
        return;
      }
      
      if (text === '/listalbums') {
        await listAlbums(env, chatId, messageId);
        return;
      }
      
      if (text === '/listartists') {
        await listArtists(env, chatId, messageId);
        return;
      }
      
      if (text === '/stats') {
        await showStats(env, chatId, messageId);
        return;
      }
      
      if (text === '/addartist') {
        await replyToMessage(env, chatId, messageId, 'Send ARTIST NAME:');
        // Store pending action
        if (!global.pendingArtists) global.pendingArtists = {};
        global.pendingArtists[userId] = true;
        return;
      }
      
      if (global.pendingArtists && global.pendingArtists[userId]) {
        await addArtist(env, chatId, messageId, text);
        delete global.pendingArtists[userId];
        return;
      }
    }
    return;
  }
  
  // Handle group messages - look for requests
  if (isGroup) {
    let artist = null;
    let albumName = null;
    
    // Pattern 1: I want Artist - Album
    let match = text.match(/i want\s+(.+?)\s*[-]\s*(.+)/i);
    if (match) {
      artist = match[1].trim();
      albumName = match[2].trim();
    }
    
    // Pattern 2: I want Artist Album
    if (!artist) {
      match = text.match(/i want\s+(.+)/i);
      if (match) {
        const rest = match[1].trim();
        const words = rest.split(' ');
        if (words.length >= 2) {
          albumName = words.pop();
          artist = words.join(' ');
        }
      }
    }
    
    // Pattern 3: Artist - Album
    if (!artist) {
      match = text.match(/^(.+?)\s*[-]\s*(.+)$/i);
      if (match) {
        artist = match[1].trim();
        albumName = match[2].trim();
      }
    }
    
    // Pattern 4: request Artist - Album
    if (!artist) {
      match = text.match(/request\s+(.+?)\s*[-]\s*(.+)/i);
      if (match) {
        artist = match[1].trim();
        albumName = match[2].trim();
      }
    }
    
    if (artist && albumName) {
      await addRequestToQueue(env, chatId, messageId, userId, username, firstName, artist, albumName);
      return;
    }
  }
}

async function addArtist(env, chatId, replyToMsgId, artistName) {
  const db = env.DB;
  
  try {
    await db.prepare('INSERT INTO artists (name) VALUES (?)').bind(artistName).run();
    await replyToMessage(env, chatId, replyToMsgId, `✅ Artist "${artistName}" added!`);
  } catch (error) {
    await replyToMessage(env, chatId, replyToMsgId, `❌ Error: ${error.message}`);
  }
}

async function addRequestToQueue(env, groupId, replyToMsgId, userId, username, firstName, artist, albumName) {
  const db = env.DB;
  
  // Get queue number
  const pendingCount = await db.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'pending'").first();
  const queueNumber = (pendingCount?.count || 0) + 1;
  
  // Save to database
  await db.prepare(`
    INSERT INTO requests (user_tg_id, user_name, artist, album_name, queue_number, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).bind(userId, username || firstName, artist, albumName, queueNumber).run();
  
  const displayName = username ? `@${username}` : firstName;
  await replyToMessage(env, groupId, replyToMsgId, `✅ Request #${queueNumber} received from ${displayName}!\n\n📀 ${artist} - ${albumName}\n\n⏳ Queue position: ${queueNumber}\n\nAdmin will process your request soon.`);
}

async function showPendingRequests(env, chatId, replyToMsgId) {
  const db = env.DB;
  
  const requests = await db.prepare(`
    SELECT queue_number, user_name, artist, album_name
    FROM requests
    WHERE status = 'pending'
    ORDER BY queue_number
  `).all();
  
  if (!requests.results || requests.results.length === 0) {
    await replyToMessage(env, chatId, replyToMsgId, '📋 No pending requests.');
    return;
  }
  
  let list = '📋 PENDING REQUESTS:\n\n';
  for (const req of requests.results) {
    list += `#${req.queue_number} | ${req.user_name} | ${req.artist} - ${req.album_name}\n`;
  }
  list += '\n✅ To clear: /clear [number] [album_id]\n📎 Album IDs: /listalbums';
  
  await replyToMessage(env, chatId, replyToMsgId, list);
}

async function clearRequest(env, adminChatId, replyToMsgId, requestNumber, albumId) {
  const db = env.DB;
  
  // Get the request
  const request = await db.prepare(`
    SELECT id, user_name
    FROM requests
    WHERE queue_number = ? AND status = 'pending'
  `).bind(requestNumber).first();
  
  if (!request) {
    await replyToMessage(env, adminChatId, replyToMsgId, `❌ Request #${requestNumber} not found.`);
    return;
  }
  
  // Get album info
  const album = await db.prepare(`
    SELECT albums.id, albums.name, artists.name as artist_name
    FROM albums
    JOIN artists ON albums.artist_id = artists.id
    WHERE albums.id = ?
  `).bind(albumId).first();
  
  if (!album) {
    await replyToMessage(env, adminChatId, replyToMsgId, `❌ Album ID ${albumId} not found. Use /listalbums`);
    return;
  }
  
  // Mark as cleared
  await db.prepare(`UPDATE requests SET status = 'cleared' WHERE id = ?`).bind(request.id).run();
  
  // Post to group
  const groupId = env.GROUP_CHAT_ID;
  const albumLink = `https://requests.zedtopvibes.com/album?id=${album.id}`;
  const caption = `💽 ALBUM: ${album.name}\n\n👤 Artist: ${album.artist_name}\n\n👇 Click below to get the album:`;
  
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: groupId,
      text: caption,
      reply_markup: {
        inline_keyboard: [[
          { text: "📀 Get Files", url: albumLink }
        ]]
      }
    })
  });
  
  await replyToMessage(env, adminChatId, replyToMsgId, `✅ Request #${requestNumber} cleared!\n\nPosted "${album.name}" in the group.`);
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