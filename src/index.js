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
  console.log('Received update:', JSON.stringify(update));
  
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
  
  console.log(`Message: isGroup=${isGroup}, text="${text}", isAdmin=${isAdmin}`);
  
  // For testing - reply to EVERY message in group (temporary)
  if (isGroup) {
    await replyToMessage(env, chatId, messageId, `🔵 Bot received: "${text}"`);
    return;
  }
  
  // Private message - /start
  if (!isGroup && text === '/start') {
    if (isAdmin) {
      await replyToMessage(env, chatId, messageId, '🎵 Admin Menu\n\n/addartist - Add artist\n/addalbum - Add album\n/multitrack - Bulk upload\n/pending - Show pending requests\n/clear [number] [album_id] - Clear request\n/listartists - Show artists\n/listalbums - Show albums\n/stats - Statistics');
    } else {
      await replyToMessage(env, chatId, messageId, '🎵 Welcome! Request music in the group by typing:\n\nI want Artist - Album');
    }
    return;
  }
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