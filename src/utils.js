// Register user in database
export async function registerUser(env, tgId, username, firstName, isAdmin) {
  const db = env.DB;
  
  await db.prepare(`
    INSERT OR IGNORE INTO users (tg_id, username, first_name, is_admin)
    VALUES (?, ?, ?, ?)
  `).bind(tgId, username || '', firstName || '', isAdmin ? 1 : 0).run();
}

// Send Telegram message
export async function sendMessage(env, chatId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
  } catch (error) {
    console.error('Send message error:', error);
  }
}

// Setup webhook
export async function setupWebhook(request, env) {
  const url = new URL(request.url);
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