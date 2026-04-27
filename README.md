# 🌐 Network Monitor

A lightweight, browser-based network monitoring tool that pings multiple IP devices and tracks response times — no server or installation required.

**[Live Demo →](https://your-username.github.io/network-monitor)**

![Network Monitor Screenshot](screenshot.png)

---

## Features

- **Multi-device monitoring** — add devices one by one, in bulk, or by scanning a subnet range
- **Live sparkline charts** — per-device latency history visualised in real time
- **Three-tab UI** — Setup, Monitor, and Results
- **Ping results table** — sortable, filterable, paginated log of every ping
- **Configurable** — set ping interval (2s–1min), duration (1min–continuous), and timeout
- **CSV export** — download the full results log including device IP and gateway metadata
- **Dark mode** — respects your OS preference automatically
- **No dependencies** — pure HTML, CSS, and JavaScript; works offline after first load

## How it works

Browsers cannot send raw ICMP ping packets. This tool uses `fetch()` with `mode: 'no-cors'` to send an HTTP request to each IP. Any response — including a connection refused or CORS error — confirms the host is reachable and measures round-trip time. A timeout (AbortController) marks the host as offline.

> **Note:** This approach works well for devices that have a web server or respond to HTTP. For devices that silently drop HTTP but respond to ICMP (some switches, printers), consider pairing this with a backend script.

---

## Getting Started

### Option 1 — GitHub Pages (recommended)

1. Fork or clone this repository
2. Go to **Settings → Pages** in your repo
3. Set source to `main` branch, `/ (root)` folder
4. Your app will be live at `https://your-username.github.io/network-monitor`

### Option 2 — Run locally

No build step needed. Just open `index.html` in your browser:

```bash
git clone https://github.com/your-username/network-monitor.git
cd network-monitor
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

Or serve it with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

---

## Usage

### 1. Setup tab

| Field | Description |
|---|---|
| My Device IP | Your machine's local IP (e.g. `192.168.1.50`) |
| Gateway IP | Your router's IP — click **Auto-fill Gateway** to guess from your device IP |
| + Add / Bulk Add | Add devices individually or paste a list |
| + Scan Range | Queue a range of IPs in your subnet (e.g. `.1` → `.50`) |
| Ping Interval | How often to ping each device |
| Duration | How long to run — choose Continuous for indefinite monitoring |
| Timeout | How long to wait before marking a host offline |

**Bulk add format** (one per line):
```
192.168.1.1, Gateway
192.168.1.10, NAS
8.8.8.8, Google DNS
1.1.1.1
```

### 2. Monitor tab

Live device cards showing:
- Online / Offline / Pending status
- Sparkline of recent latency
- Average, Min/Max latency
- Uptime percentage

### 3. Results tab

Full ping log with:
- Sortable columns (time, IP, label, status, latency)
- Filter by IP/label or status
- Paginated view (20 / 50 / 100 per page)
- CSV export (exports filtered results if a filter is active)

---

## File Structure

```
network-monitor/
├── index.html    # App shell and markup
├── style.css     # All styles (light + dark mode)
├── app.js        # Application logic
└── README.md
```

---

## Browser Compatibility

Works in all modern browsers that support `fetch`, `AbortController`, and CSS custom properties:

| Browser | Support |
|---|---|
| Chrome 80+ | ✅ |
| Firefox 75+ | ✅ |
| Safari 13+ | ✅ |
| Edge 80+ | ✅ |

---

## License

MIT — free to use, modify, and distribute.
