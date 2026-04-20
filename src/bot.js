import { registerUser, sendMessage } from './utils.js';
import { handleAdminCommand, handleAdminSteps } from './admin.js';
import { listArtists, showStats } from './commands.js';

// Store pending admin actions
export const pendingActions = new Map();

export async function handleTelegramUpdate(update, env) {
  if (!update.message) return;
  
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const userId = msg.from.id.toString();
  const username = msg.from.username || '';
  const firstName = msg.from.first_name || '';
  
  // Check if admin
  const adminIds = env.ADMIN_IDS ? env.ADMIN_IDS.split(',') : [];
  const isAdmin = adminIds.includes(userId);
  
  // Register user
  await registerUser(env, userId, username, firstName, isAdmin);
  
  // Handle /start
  if (text === '/start') {
    if (isAdmin) {
      await sendMessage(env, chatId, '🎵 Admin Menu\n\n/addartist - Add new artist\n/listartists - Show all artists\n/addalbum - Add album\n/addtrack - Upload track\n/stats - Show statistics\n/cancel - Cancel operation');
    } else {
      await sendMessage(env, chatId, '🎵 Welcome to Zambian Music Updates!\n\nRequest songs in the group and I will deliver them here.');
    }
    return;
  }
  
  // Handle admin commands
  if (isAdmin) {
    await handleAdminCommand(env, chatId, userId, text, msg);
  }
  
  // Handle pending steps (always after commands)
  if (pendingActions.has(userId)) {
    await handleAdminSteps(env, chatId, userId, text, msg);
  }
}