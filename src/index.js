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
  
  // Use AI to understand the message
  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: `You analyze music requests. Determine:
1. Is this a music request? (wants to get an album/song)
2. If yes, extract artist name and album name
3. If no, respond as a friendly music assistant

Respond with JSON only:
{"is_request": true/false, "artist": "artist name", "album": "album name", "reply": "your response"}

If not a request, put your friendly reply in "reply".
If it is a request, put "reply" as "Request received!"`
        },
        {
          role: 'user',
          content: text
        }
      ]
    });
    
    // Parse AI response
    let parsed;
    try {
      parsed = JSON.parse(aiResponse.response);
    } catch (e) {
      parsed = { is_request: false, reply: "I'm here to help with music requests! Try: I want Artist - Album" };
    }
    
    // Handle music requests
    if (parsed.is_request && parsed.artist && parsed.album && parsed.artist !== "unknown" && parsed.album !== "unknown") {
      // Only process requests in group chat
      if (isGroup) {
        await addRequestToQueue(env, chatId, messageId, userId, username, firstName, parsed.artist, parsed.album);
      } else {
        await replyToMessage(env, chatId, messageId, "Please make music requests in the group chat!");
      }
    } else {
      // Normal chat response
      await replyToMessage(env, chatId, messageId, parsed.reply || "I'm your music assistant! Request songs by saying: I want Artist - Album");
    }
  } catch (error) {
    console.error('AI error:', error);
    await replyToMessage(env, chatId, messageId, "Sorry, I'm having trouble right now. Please try again later.");
  }
}

async function addRequestToQueue(env, groupId, replyToMsgId, userId, username, firstName, artist, albumName) {
  const db = env.DB;
  
  // Create table if needed
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