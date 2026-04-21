export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Test endpoint for AI
    if (path === '/test-ai') {
      const text = url.searchParams.get('text') || 'I want Yo Maps Komando';
      
      try {
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
        
        return new Response(JSON.stringify({
          success: true,
          input: text,
          output: aiResponse,
          parsed: aiResponse.response
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Homepage
    if (path === '/') {
      return new Response('AI Test Bot - Go to /test-ai?text=your request');
    }
    
    // Telegram webhook (optional)
    if (path === '/webhook' && request.method === 'POST') {
      return new Response('OK');
    }
    
    return new Response('Not found', { status: 404 });
  }
};