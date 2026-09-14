# Live Chat (share-a-link)

This is a tiny “customer-service style” live chat you can host and send as a link.

## What it does
- **Host link**: opens the operator/host view
- **Guest link**: opens the guest view
- Messages stream **in real time** (WebSocket)
- No accounts, no phone numbers

## Run locally
1) Install Node.js 18+ (Node 20+ recommended)
2) In this folder:

```bash
npm install
npm start
```

3) Open:
- Host view: http://localhost:3000/host
- Guest view: http://localhost:3000/ (or /guest)

## Share on the internet
You can deploy this to **Render** (easy) or **Railway** (easy) as a Node web service.

### Render (recommended)
- Create a new **Web Service** from a GitHub repo containing this folder
- Build command: `npm install`
- Start command: `npm start`

Then share:
- `https://YOUR-APP.onrender.com/host` (you)
- `https://YOUR-APP.onrender.com/` (them)

## Notes
- This is a simple demo: it keeps chat history **in memory** (resets on restart).
- If you want multiple rooms/sessions (unique links per person), say so and I’ll add it.
