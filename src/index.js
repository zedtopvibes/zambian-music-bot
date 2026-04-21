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
  
  // Show typing indicator
  await sendChatAction(env, chatId);
  
  // FIRST: Check if it's a music request using simple pattern
  const lowerText = text.toLowerCase();
  const isMusicRequest = (
    lowerText.includes('i want') || 
    lowerText.includes('request') || 
    (lowerText.includes('album') && !lowerText.includes('who')) ||
    text.includes('-')
  );
  
  // SECOND: If it's a music request, extract artist and album
  if (isMusicRequest && isGroup) {
    let artist = null;
    let album = null;
    
    // Try to extract using patterns
    if (text.includes('-')) {
      const parts = text.split('-');
      if (parts.length >= 2) {
        artist = parts[0].trim();
        album = parts[1].trim();
        // Remove "i want" from artist if present
        artist = artist.replace(/i want/i, '').replace(/request/i, '').trim();
      }
    } else {
      // Look for "i want" pattern
      const match = text.match(/i want\s+(.+)/i);
      if (match) {
        const rest = match[1].trim();
        const words = rest.split(' ');
        if (words.length >= 2) {
          album = words.pop();
          artist = words.join(' ');
        } else {
          artist = rest;
          album = rest;
        }
      }
    }
    
    if (artist && album) {
      await addRequestToQueue(env, chatId, messageId, userId, username, firstName, artist, album);
      return;
    }
  }
  
  // THIRD: Use AI for chat (not for requests)
  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt: `You are a friendly music assistant for Zambian Music Updates. Keep responses short (1-2 sentences).

User asked: "${text}"

Your friendly reply:`,
      max_tokens: 100
    });
    
    const reply = aiResponse.response || aiResponse;
    await replyToMessage(env, chatId, messageId, reply);
    
  } catch (error) {
    console.error('AI error:', error);
    await replyToMessage(env, chatId, messageId, "🎵 I'm your music assistant! To request a song, type: I want Artist - Album");
  }
}

async function addRequestToQueue(env, groupId, replyToMsgId, userId, username, firstName, artist, albumName) {
  const db = env.DB;
  
  // Create table if needed
  try {
    await db.prepare("CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_tg_id TEXT NOT NULL,
      user_name TEXT,
      artist TEXT,
      album_name TEXT,
      queue_number INTEGER,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )").run();
  } catch (e) {
    // Table might already exist
  }
  
  const pendingCount = await db.prepare("SELECT COUNT(*) as count FROM requests WHERE status = 'pending'").first();
  const queueNumber = (pendingCount?.count || 0) + 1;
  
  await db.prepare(`
    INSERT INTO requests (user_tg_id, user_name, artist, album_name, queue_number, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).bind(userId, username || firstName, artist, albumName, queueNumber).run();
  
  const displayName = username ? `@${username}` : firstName;
  await replyToMessage(env, groupId, replyToMsgId, `✅ Request #${queueNumber} received from ${displayName}!\n\n🎤 Artist: ${artist}\n💿 Album: ${albumName}\n\n⏳ Queue position: ${queueNumber}\n\nAdmin will process your request soon.`);
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