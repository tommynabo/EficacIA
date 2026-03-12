import 'dotenv/config';

const dsn = process.env.UNIPILE_DSN?.trim();
const key = process.env.UNIPILE_API_KEY?.trim();

async function run() {
  const rAccs = await fetch(`https://${dsn}/api/v1/accounts`, { headers: { 'X-API-KEY': key }});
  const accs = await rAccs.json();
  const accId = accs.items?.[0]?.id || accs[0]?.id;
  
  if (!accId) return console.log('No accId');
  
  const rChats = await fetch(`https://${dsn}/api/v1/chats?account_id=${accId}&limit=1`, { headers: { 'X-API-KEY': key }});
  const chats = await rChats.json();
  const chat = chats.items?.[0] || chats.chats?.[0];
  
  console.log('Chat:', JSON.stringify(chat, null, 2));
  
  const rMsgs = await fetch(`https://${dsn}/api/v1/chats/${chat.id}/messages?limit=2`, { headers: { 'X-API-KEY': key }});
  const msgs = await rMsgs.json();
  
  console.log('Messages:', JSON.stringify(msgs.items || msgs.messages, null, 2));
}
run().catch(console.error);
