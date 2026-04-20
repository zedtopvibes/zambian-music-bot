// Cloudflare Worker for Zambian Music Updates Bot
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
      
      // Handle /start command
      if (update.message && update.message.text === '/start') {
        const chatId = update.message.chat.id;
        await sendTelegramMessage(env, chatId, '🎵 Welcome to Zambian Music Updates Bot!\n\nSend me music files and I will store them.');
      }
      
      return new Response('OK');
    }
    
    // Setup webhook (visit this URL once)
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

// Helper function to send Telegram messages
async function sendTelegramMessage(env, chatId, text) {
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
