#!/usr/bin/env node
/**
 * Fetch X DMs with a specific user by their @username.
 * Usage: node scripts/x-fetch-dm-conversation.mjs @username1 @username2 ...
 */
import https from 'https';

const TOKEN = 'Z1VTUnhDNlU5YjhtREVvVHhEa3ZNdnNhUkhZN1QyX0F3blZIZ3I0Y0NneWV1OjE3NzM0ODE2NTU0MzU6MToxOmF0OjE';

const usernames = process.argv.slice(2).map(u => u.replace('@', '').trim()).filter(Boolean);
if (!usernames.length) {
  console.error('Usage: node scripts/x-fetch-dm-conversation.mjs @username1 @username2 ...');
  process.exit(1);
}

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { Authorization: 'Bearer ' + TOKEN } }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, data: b }); }
      });
    }).on('error', e => resolve({ status: 0, data: e.message }));
  });
}

(async () => {
  for (const username of usernames) {
    console.log('\n========================================');
    console.log('Fetching DMs with @' + username);

    // Lookup user ID
    const userRes = await get('https://api.x.com/2/users/by/username/' + username + '?user.fields=id,username,name');
    if (userRes.status !== 200 || !userRes.data?.data?.id) {
      console.log('Could not find user @' + username + ':', JSON.stringify(userRes.data));
      continue;
    }
    const userId = userRes.data.data.id;
    const displayName = userRes.data.data.name;
    console.log('Found: ' + displayName + ' (@' + username + ') ID: ' + userId);

    // Fetch DM conversation
    const dmRes = await get(
      'https://api.x.com/2/dm_conversations/with/' + userId +
      '/dm_events?max_results=100&dm_event.fields=id,text,created_at,sender_id&expansions=sender_id&user.fields=id,username,name'
    );
    if (dmRes.status !== 200) {
      console.log('DM fetch failed (status ' + dmRes.status + '):', JSON.stringify(dmRes.data));
      continue;
    }

    const events = dmRes.data?.data || [];
    const users = {};
    (dmRes.data?.includes?.users || []).forEach(u => { users[u.id] = u; });

    if (!events.length) {
      console.log('No DM events in the last 30 days with this user.');
      continue;
    }

    console.log('\nMessages (' + events.length + ' events, newest first):');
    events.forEach((e, i) => {
      const sender = users[e.sender_id];
      const senderName = sender ? '@' + sender.username : 'ID:' + e.sender_id;
      const time = e.created_at || '';
      console.log('  ' + (i + 1) + '. [' + time + '] ' + senderName + ': ' + (e.text || '(no text)'));
    });
  }
})();
