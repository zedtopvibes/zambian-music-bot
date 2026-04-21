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
  
  const isGroup = chatId.toString().startsWith('-');
  
  // DEBUG: Reply to EVERY message so we know it's working
  await replyToMessage(env, chatId, messageId, `DEBUG: I received: "${text}"\n\nIs Group: ${isGroup}`);
}