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

// Keep track of the other user's name globally
let otherPartyName = role === 'host' ? 'Guest' : 'Host';

if (roomEl) roomEl.textContent = room;
if (nameInput) nameInput.value = localStorage.getItem(role + 'Name') || (role === 'host' ? 'Host' : 'Guest');

// Helper function to keep placeholder updated with the other person's name
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
    div.className = 'message ' + (isMe ? 'me' : 'them');
    
    let htmlContent = '<div class="byline"><span>' + escapeHtml(msg.name || msg.sender) + '</span></div>' +
                      '<div>' + escapeHtml(msg.text) + '</div>';
    
    if (isMe) {
        const seenText = msg.seen ? ('Seen by ' + escapeHtml(msg.seenBy || 'Someone')) : 'Sent';
        htmlContent += '<div class="status-container"><span class="status-receipt" data-msg-id="' + msg.id + '">' + seenText + '</span></div>';
    }
    
    div.innerHTML = htmlContent;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Track the other person's name when their message arrives
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

function connect() {
  const source = new EventSource('/api/events?room=' + encodeURIComponent(room) + '&role=' + encodeURIComponent(role));

  source.addEventListener('hello', (event) => {
    const data = JSON.parse(event.data);
    if (messagesEl) {
      messagesEl.innerHTML = '';
      if (!data.messages.length) {
        messagesEl.innerHTML = '<div class="empty" id="empty"><div class="empty-icon">🐾</div><strong>Meow-nagement Dashboard</strong><br>No active tickets in the queue. Everything is running purr-fectly!</div>';
      }
      
      // Determine other party name from existing history if available
      const lastThemMessage = [...data.messages].reverse().find(m => m.sender !== role);
      if (lastThemMessage) {
         otherPartyName = (lastThemMessage.name || lastThemMessage.sender).trim();
      }
      
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
          if (containerEl) {
              containerEl.innerHTML = '';
          } else {
              let typingEl = document.getElementById('typing-indicator');
              if (typingEl) typingEl.remove();
          }
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
  const name = (nameInput ? nameInput.value : (role === 'host' ? 'Host' : 'Guest')).trim();
  localStorage.setItem(role + 'Name', name);
  input.value = '';
  input.focus();
  updateDynamicPlaceholder();
  await fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: room, sender: role, name: name, text: text })
  });
});

const copyGuestAction = () => {
  const targetVal = guestLinkEl ? (guestLinkEl.value || guestLinkEl.textContent) : makeUrl('/');
  navigator.clipboard.writeText(targetVal);
  showToast('Guest link copied');
};
document.querySelector('#copyBtn')?.addEventListener('click', copyGuestAction);
document.querySelector('#copyGuest')?.addEventListener('click', copyGuestAction);

const copyHostAction = () => {
  const targetVal = hostLinkEl ? (hostLinkEl.value || hostLinkEl.textContent) : makeUrl('/host');
  navigator.clipboard.writeText(targetVal);
  showToast('Host link copied');
};
document.querySelector('#copyHostBtn')?.addEventListener('click', copyHostAction);
document.querySelector('#copyHost')?.addEventListener('click', copyHostAction);

document.querySelector('#newRoom')?.addEventListener('click', async () => {
  const res = await fetch('/api/new-room');
  const data = await res.json();
  room = data.room;
  localStorage.setItem('funChatRoom', room);
  const url = new URL(location.href);
  url.searchParams.set('room', room);
  location.href = url.toString();
});

const clearChatAction = async () => {
  if (!confirm('Clear this room’s messages?')) return;
  await fetch('/api/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: room })
  });
};
document.querySelector('#clearBtn')?.addEventListener('click', clearChatAction);

connect();

// Sidebar Drawer Menu Navigation Toggle Controller
const openMenuBtn = document.getElementById('open-menu-btn');
const closeMenuBtn = document.getElementById('close-menu-btn');
const sidebarMenu = document.getElementById('sidebar-menu');

if (openMenuBtn && sidebarMenu) {
  openMenuBtn.addEventListener('click', () => {
    sidebarMenu.classList.add('open');
  });
}

if (closeMenuBtn && sidebarMenu) {
  closeMenuBtn.addEventListener('click', () => {
    sidebarMenu.classList.remove('open');
  });
}

// Single Consolidated Drag & Drop / File Attachment Logic
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const attachBtn = document.getElementById('attach-btn') || document.getElementById('attachment-btn');

  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => fileInput.click());
  }

  if (dropZone && fileInput) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => dropZone.classList.add('active', 'drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => dropZone.classList.remove('active', 'drag-over'), false);
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      handleImageFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
      handleImageFiles(e.target.files);
    });
  }
});

function handleImageFiles(files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file!');
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onloadend = () => {
    const base64Image = reader.result;
    console.log('Image encoded successfully:', base64Image);
  };
}