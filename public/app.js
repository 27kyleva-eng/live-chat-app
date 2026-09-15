const qs = new URLSearchParams(location.search);
const role = document.body.dataset.role || 'guest';
let room = qs.get('room') || localStorage.getItem('funChatRoom') || 'lobby';
localStorage.setItem('funChatRoom', room);

const $ = (sel) => document.querySelector(sel);
const messagesEl = $('#messages');
const form = $('#composer');
const input = $('#messageInput');
const statusEl = $('#status');
const roomEl = $('#roomLabel');
const guestLinkEl = $('#guestLink');
const hostLinkEl = $('#hostLink');
const emptyEl = $('#empty');
const toastEl = $('#toast');
const nameInput = $('#nameInput');

if (roomEl) roomEl.textContent = room;
if (nameInput) nameInput.value = localStorage.getItem(`${role}Name`) || (role === 'host' ? 'Host' : 'Guest');

function makeUrl(path, roomId = room) {
  const u = new URL(path, location.origin);
  u.searchParams.set('room', roomId);
  return u.toString();
}

function updateLinks() {
  if (guestLinkEl) guestLinkEl.textContent = makeUrl('/');
  if (hostLinkEl) hostLinkEl.textContent = makeUrl('/host');
}
updateLinks();

function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1600);
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function renderMessage(msg) {
    if (emptyEl) emptyEl.remove();
    const div = document.createElement('article');
    const isMe = msg.sender === role;
    div.className = `message ${isMe ? 'me' : 'them'}`;
    
    div.innerHTML = `
        <div class="byline"><span>${escapeHtml(msg.name || msg.sender)}</span></div>
        <div>${escapeHtml(msg.text)}</div>
        ${isMe ? `<div class="status-container"><span class="status-receipt" data-msg-id="${msg.id}">${msg.seen ? `Seen by ${escapeHtml(msg.seenBy || 'Someone')}` : 'Sent'}</span></div>` : ''}
    `;
    
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Fixed to use nameInput?.value to match your exact login field!
    if (!isMe && !msg.seen) {
        const myCurrentName = (nameInput?.value || (role === 'host' ? 'Host' : 'Guest')).trim();
        fetch('/api/seen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                room, 
                msgId: msg.id,
                seenBy: myCurrentName
            })
        }).catch(err => console.error(err));
    }
}


function setPresence(online) {
  if (!statusEl) return;
  const other = role === 'host' ? online.guest : online.host;
  statusEl.textContent = other > 0 ? 'Someone is online now' : 'Waiting for the other person';
}


function connect() {
  const source = new EventSource(`/api/events?room=${encodeURIComponent(room)}&role=${encodeURIComponent(role)}`);

  source.addEventListener('hello', (event) => {
    const data = JSON.parse(event.data);
    if (messagesEl) {
      messagesEl.innerHTML = '';
      if (!data.messages.length) {
        messagesEl.innerHTML = `<div class="empty" id="empty"><div class="empty-icon">💬</div><strong>No messages yet.</strong><br>Send the first one and pretend you run a tiny help desk.</div>`;
      }
      data.messages.forEach(renderMessage);
    }
    setPresence(data.online);
  });

  source.addEventListener('message', (event) => renderMessage(JSON.parse(event.data)));
  source.addEventListener('presence', (event) => setPresence(JSON.parse(event.data).online));
  source.addEventListener('clear', () => {
    messagesEl.innerHTML = `<div class="empty" id="empty"><div class="empty-icon">✨</div><strong>Chat cleared.</strong><br>Fresh room, fresh gimmick.</div>`;
  });
    source.addEventListener('seen', (event) => {
        const data = JSON.parse(event.data);
        const receipt = document.querySelector(`.status-receipt[data-msg-id="${data.msgId}"]`);
        if (receipt) {
            receipt.textContent = `Seen by ${data.seenBy || 'Someone'}`;
        }
    });
    source.addEventListener('typing', (event) => {
        const data = JSON.parse(event.data);
        if (data.sender === role) return;

        let typingEl = document.getElementById('typing-indicator');
        
        if (data.isTyping) {
            if (!typingEl) {
                typingEl = document.createElement('div');
                typingEl.id = 'typing-indicator';
                typingEl.style.fontSize = '0.85rem';
                typingEl.style.color = '#8e8e8e';
                typingEl.style.margin = '5px 10px';
                typingEl.style.fontStyle = 'italic';
                messagesEl.appendChild(typingEl);
            }
            typingEl.textContent = `${escapeHtml(data.name)} is purrring 🐾`;
            messagesEl.scrollTop = messagesEl.scrollHeight;
        } else {
            if (typingEl) typingEl.remove();
        }
    });


  source.onerror = () => {
    if (statusEl) statusEl.textContent = 'Reconnecting…';
  };
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  const name = (nameInput?.value || (role === 'host' ? 'Host' : 'Guest')).trim();
  localStorage.setItem(`${role}Name`, name);
  input.value = '';
  input.focus();
  await fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, sender: role, name, text })
  });
});

$('#copyGuest')?.addEventListener('click', async () => {
  await navigator.clipboard.writeText(makeUrl('/'));
  showToast('Guest link copied');
});

$('#copyHost')?.addEventListener('click', async () => {
  await navigator.clipboard.writeText(makeUrl('/host'));
  showToast('Host link copied');
});

$('#newRoom')?.addEventListener('click', async () => {
  const res = await fetch('/api/new-room');
  const data = await res.json();
  room = data.room;
  localStorage.setItem('funChatRoom', room);
  const url = new URL(location.href);
  url.searchParams.set('room', room);
  location.href = url.toString();
});

$('#clearChat')?.addEventListener('click', async () => {
  if (!confirm('Clear this room’s messages?')) return;
  await fetch('/api/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room })
  });
});
// Monitor keyboard typing inputs
let typingTimeout;
input?.addEventListener('input', () => {
    const myCurrentName = (nameInput?.value || (role === 'host' ? 'Host' : 'Guest')).trim();
    
    // Send a "typing start" notification to the server
    fetch('/api/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, sender: role, name: myCurrentName, isTyping: true })
    }).catch(err => console.error(err));

    // Clear indicator after 2 seconds of silence
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        fetch('/api/typing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room, sender: role, name: myCurrentName, isTyping: false })
        }).catch(err => console.error(err));
    }, 2000);
});

connect();
// Sidebar open and close click event handlers
const sidebarElement = document.getElementById('sidebar-menu');
const openSidebarBtn = document.getElementById('open-menu-btn');
const closeSidebarBtn = document.getElementById('close-menu-btn');

openSidebarBtn?.addEventListener('click', () => {
    if (sidebarElement) sidebarElement.style.width = '240px'; /* Reveal Drawer panel */
});

closeSidebarBtn?.addEventListener('click', () => {
    if (sidebarElement) sidebarElement.style.width = '0'; /* Hide Drawer panel */
});
