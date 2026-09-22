cat << 'EOF' > public/app.js
const qs = new URLSearchParams(location.search);
const role = document.body.dataset.role || 'guest';
let room = qs.get('room') || localStorage.getItem('funChatRoom') || 'lobby';
localStorage.setItem('funChatRoom', room);

const messagesEl = document.querySelector('#messages');
const form = document.querySelector('#composer');
const input = document.querySelector('#messageInput');
const statusEl = document.querySelector('#status');
const roomEl = document.querySelector('#roomLabel');

const guestLinkEl = document.querySelector('#shareInput') || document.querySelector('#guestLink');
const hostLinkEl = document.querySelector('#hostInput') || document.querySelector('#hostLink');

const emptyEl = document.querySelector('#empty');
const toastEl = document.querySelector('#toast');
const nameInput = document.querySelector('#nameInput');

 let pendingImageData = null;
 let otherPartyName = role === 'host' ? 'Guest' : 'Host';

if (roomEl) roomEl.textContent = room;
if (nameInput) nameInput.value = localStorage.getItem(role + 'Name') || (role === 'host' ? 'Host' : 'Guest');

function updateDynamicPlaceholder() {
  if (input) {
    input.placeholder = `Meow back at ${otherPartyName}...`;
  }
}

function makeUrl(path, roomId = room) {
  const u = new URL(path, location.origin);
  u.searchParams.set('room', roomId);
  return u.toString();
}

function updateLinks() {
  if (guestLinkEl) {
    if (guestLinkEl.tagName === 'INPUT') guestLinkEl.value = makeUrl('/');
    else guestLinkEl.textContent = makeUrl('/');
  }
  if (hostLinkEl) {
    if (hostLinkEl.tagName === 'INPUT') hostLinkEl.value = makeUrl('/host');
    else hostLinkEl.textContent = makeUrl('/host');
  }
}
updateLinks();

function showToast(text) {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 1600);
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderMessage(msg) {
    if (emptyEl) emptyEl.remove();
    const div = document.createElement('article');
    const isMe = msg.sender === role;
    div.className = 'message ' + (isMe ? 'me' : 'them');
    
    let htmlContent = '<div class="byline"><span>' + escapeHtml(msg.name || msg.sender) + '</span></div>';
    if (msg.text) htmlContent += '<div>' + escapeHtml(msg.text) + '</div>';
    if (msg.image) htmlContent += '<div><img src="' + msg.image + '" class="message-image" style="max-width: 100%; border-radius: 8px; margin-top: 5px;" alt="Attached image" /></div>';
    
    if (isMe) {
        const seenText = msg.seen ? ('Seen by ' + escapeHtml(msg.seenBy || 'Someone')) : 'Sent';
        htmlContent += '<div class="status-container"><span class="status-receipt" data-msg-id="' + msg.id + '">' + seenText + '</span></div>';
    }
    
    div.innerHTML = htmlContent;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (!isMe) {
        otherPartyName = (msg.name || msg.sender).trim() || (role === 'host' ? 'Guest' : 'Host');
        updateDynamicPlaceholder();
         const myCurrentName = (nameInput ? nameInput.value : (role === 'host' ? 'Host' : 'Guest')).trim();
        fetch('/api/seen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: room, msgId: msg.id, seenBy: myCurrentName })
        }).catch(err => console.error(err));
    }
}

function setPresence(online) {
  if (!statusEl) return;
  const other = role === 'host' ? online.guest : online.host;
  statusEl.textContent = other > 0 ? 'Someone is online now' : 'Waiting for the other person';
}

 window.clearImagePreview = function() {
  pendingImageData = null;
  const previewContainer = document.getElementById('image-preview-container');
  if (previewContainer) previewContainer.innerHTML = '';
};
EOF
cat << 'EOF' >> public/app.js

function connect() {
  const source = new EventSource('/api/events?room=' + encodeURIComponent(room) + '&role=' + encodeURIComponent(role));

  source.addEventListener('hello', (event) => {
    const data = JSON.parse(event.data);
    if (messagesEl) {
      messagesEl.innerHTML = '';
      if (!data.messages.length) {
        messagesEl.innerHTML = '<div class="empty" id="empty"><div class="empty-icon">🐾</div><strong>Meow-nagement Dashboard</strong><br>No active tickets in the queue. Everything is running purr-fectly!</div>';
      }
      const lastThemMessage = [...data.messages].reverse().find(m => m.sender !== role);
      if (lastThemMessage) otherPartyName = (lastThemMessage.name || lastThemMessage.sender).trim();
      data.messages.forEach(renderMessage);
    }
    setPresence(data.online);
    updateDynamicPlaceholder();
  });

  source.addEventListener('message', (event) => renderMessage(JSON.parse(event.data)));
  source.addEventListener('presence', (event) => setPresence(JSON.parse(event.data).online));
   source.addEventListener('clear', () => {
    messagesEl.innerHTML = '<div class="empty" id="empty"><div class="empty-icon">🐾</div><strong>Chat cleared.</strong><br>Fresh space, purr-fect place.</div>';
  });
  
  source.addEventListener('seen', (event) => {
      const data = JSON.parse(event.data);
      const receipt = document.querySelector('.status-receipt[data-msg-id="' + data.msgId + '"]');
      if (receipt) receipt.textContent = 'Seen by ' + (data.seenBy || 'Someone');
  });
  
  source.addEventListener('typing', (event) => {
      const data = JSON.parse(event.data);
      if (data.sender === role) return;
       const containerEl = document.getElementById('typing-container');
      
      if (data.isTyping) {
          if (data.name) {
             otherPartyName = data.name.trim();
             updateDynamicPlaceholder();
          }
           if (containerEl) {
              containerEl.innerHTML = '<div id="typing-indicator" style="font-size: 0.85rem; color: #8e8e8e; font-style: italic; margin: 5px 0;">' + escapeHtml(data.name) + ' is purrring 🐾</div>';
          } else {
              let typingEl = document.getElementById('typing-indicator');
              if (!typingEl) {
                  typingEl = document.createElement('div');
                  typingEl.id = 'typing-indicator';
                  typingEl.style.fontSize = '0.85rem';
                  typingEl.style.color = '#8e8e8e';
                  typingEl.style.margin = '5px 10px';
                  typingEl.style.fontStyle = 'italic';
                  messagesEl.appendChild(typingEl);
              }
              typingEl.textContent = escapeHtml(data.name) + ' is purrring 🐾';
          }
          if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      } else {
          if (containerEl) containerEl.innerHTML = '';
          else {
              let typingEl = document.getElementById('typing-indicator');
              if (typingEl) typingEl.remove();
          }
      }
  });

  source.onerror = () => { if (statusEl) statusEl.textContent = 'Reconnecting…'; };
}

 form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
   if (!text && !pendingImageData) return;

  const name = (nameInput ? nameInput.value : (role === 'host' ? 'Host' : 'Guest')).trim();
  localStorage.setItem(role + 'Name', name);
  
  const payload = { room, sender: role, name, text, image: pendingImageData };
  input.value = '';
  window.clearImagePreview();
  input.focus();
  updateDynamicPlaceholder();

  await fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
});

const copyGuestBtn = document.querySelector('#copyBtn');
if (copyGuestBtn) {
  copyGuestBtn.addEventListener('click', () => {
    const targetVal = guestLinkEl ? (guestLinkEl.value || guestLinkEl.textContent) : makeUrl('/');
    navigator.clipboard.writeText(targetVal).then(() => showToast('Copied guest link!'));
  });
}

const copyHostBtn = document.querySelector('#copyHostBtn');
if (copyHostBtn) {
  copyHostBtn.addEventListener('click', () => {
    const targetVal = hostLinkEl ? (hostLinkEl.value || hostLinkEl.textContent) : makeUrl('/host');
    navigator.clipboard.writeText(targetVal).then(() => showToast('Copied host link!'));
  });
}

const clearBtn = document.querySelector('#clearBtn');
if (clearBtn) {
  clearBtn.addEventListener('click', async () => {
    if (confirm('Clear all history for this room?')) {
      await fetch('/api/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room })
      });
    }
  });
}

const newRoomBtn = document.querySelector('#newRoom');
if (newRoomBtn) {
  newRoomBtn.addEventListener('click', () => {
    const newRoomId = Math.random().toString(36).substring(2, 10);
    location.search = '?room=' + newRoomId;
  });
}

const chatCard = document.querySelector('.chat-card');
let dragCounter = 0;

window.addEventListener('dragover', (e) => { e.preventDefault(); });
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1 && chatCard) chatCard.classList.add('drag-over');
});
window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0 && chatCard) chatCard.classList.remove('drag-over');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  if (chatCard) chatCard.classList.remove('drag-over');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const droppedFile = files[0];
    if (droppedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = function(event) {
        pendingImageData = event.target.result;
        let previewContainer = document.getElementById('image-preview-container');
        if (!previewContainer) {
          previewContainer = document.createElement('div');
          previewContainer.id = 'image-preview-container';
          previewContainer.style.padding = '5px 15px';
          form.parentNode.insertBefore(previewContainer, form);
        }
        previewContainer.innerHTML = `
          <div style="position: relative; display: inline-block;">
            <img src="${pendingImageData}" style="max-height: 60px; border-radius: 4px; border: 1px solid #ccc;" />
            <button type="button" onclick="window.clearImagePreview()" style="position: absolute; top: -5px; right: -5px; background: red; color: white; border: none; border-radius: 50%; width: 18px; height: 18px; font-size: 11px; cursor: pointer; line-height: 1;">&times;</button>
          </div>
        `;
      };
      reader.readAsDataURL(droppedFile);
    } else {
      showToast('Only image files are supported here!');
    }
  }
});
 
connect();
EOF
