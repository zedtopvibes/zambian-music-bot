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
  
  try {
    // Try different AI model - Llama 2 is more stable
    const aiResponse = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt: `You are a music assistant for Zambian Music Updates. 
      
User said: "${text}"

If this is a music request (user wants an album or song), respond with:
REQUEST: artist=ARTIST_NAME, album=ALBUM_NAME

If not a music request, respond with a short friendly reply.

Your response:`,
      max_tokens: 150
    });
    
    const reply = aiResponse.response || aiResponse;
    
    // Check if it's a request
    if (reply.includes('REQUEST:')) {
      // Extract artist and album
      const artistMatch = reply.match(/artist=([^,]+)/);
      const albumMatch = reply.match(/album=([^\n]+)/);
      
      const artist = artistMatch ? artistMatch[1].trim() : null;
      const album = albumMatch ? albumMatch[1].trim() : null;
      
      if (artist && album && isGroup) {
        await addRequestToQueue(env, chatId, messageId, userId, username, firstName, artist, album);
        return;
      } else if (artist && album && !isGroup) {
        await replyToMessage(env, chatId, messageId, "Please make music requests in the group chat!");
        return;
      }
    }
    
    // Not a request, send AI reply
    let cleanReply = reply.replace('REQUEST: artist=..., album=...', '').trim();
    if (!cleanReply) {
      cleanReply = "I'm your music assistant! To request a song, say: I want [Artist] - [Album]";
    }
    await replyToMessage(env, chatId, messageId, cleanReply);
    
  } catch (error) {
    console.error('AI error:', error);
    // Fallback response
    await replyToMessage(env, chatId, messageId, "🎵 I'm your music assistant! To request a song, type: I want [Artist] - [Album]");
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