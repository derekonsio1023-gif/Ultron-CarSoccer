# Car Soccer multiplayer server

This local server serves the game files and implements the room API and
WebSocket signaling used by the bundled browser client. Game simulation remains
peer-to-peer in the existing client; this server does not replace its physics.

## Run locally

From this directory:

```bash
npm start
```

Open `http://localhost:8080` in two browser tabs on the same computer, then
create a private room in one tab and join it using the invite link or room code
in the other. The server defaults to `127.0.0.1`.

The game requires HTTPS for WebRTC. To test from another device on the same
trusted network, provide a PFX certificate whose subject alternative name
includes the server's LAN IP, then set `HOST` to that IP and configure
`TLS_PFX_PATH` (and `TLS_PFX_PASSPHRASE` if needed). Both devices must trust the
certificate before opening `https://<server-lan-ip>:8080`. Keep the PFX and
private key outside the project directory.

## Public deployment

For people on different networks, deploy this server behind HTTPS and configure
the host to reach it at the same origin as the game. WebSocket upgrades must be
forwarded to `/api/multiplayer/room/*`. Do not expose the HTTP development
server directly to the public internet.

### GitHack frontend

The root `index.html` can also be served from a GitHub repository with GitHack.
Its asset URLs are relative to the repository path, while multiplayer API and
WebSocket traffic use `CAR_SOCCER_API_BASE` in the page and connect to this
server over HTTPS/WSS. The server allows the `https://raw.githack.com` origin by
default; set `CORS_ORIGINS` to a comma-separated origin list to change that.

After changing the frontend or server, push the changes to GitHub and wait for
Render to redeploy the server. Open the GitHack URL for the repository's
`index.html`, not the Render URL, to use the GitHack-hosted frontend.

This is an initial 1v1-ready signaling implementation. It uses the client's
existing STUN configuration; some NAT or firewall combinations may require a
TURN service and a client update. Room data is held in memory, so rooms are
lost when the process restarts. Add persistent storage, request throttling, and
operational monitoring before a public launch.
