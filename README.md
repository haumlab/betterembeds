# BetterEmbeds

Self-hosted Discord embed fixer for Twitter/X, Instagram, TikTok, Reddit, and Facebook (including Marketplace, Events, Groups, Videos, and Pages).

Works like FxTwitter — replace the original domain with your host and Discord gets a rich embed with images, videos, and engagement stats.

## Supported platforms

| Platform | Stats shown |
|---|---|
| Twitter / X | 💬 replies · 🔁 retweets · ❤️ likes · 👁 views |
| Instagram | ❤️ likes · 💬 comments |
| TikTok | ❤️ likes · 💬 comments · 🔗 shares · 👁 views |
| Reddit | ⬆️ upvotes · 💬 comments |
| Facebook posts | 👍 likes · 💬 comments · ↗️ shares |
| Facebook events | ✅ going · 🤔 interested |
| Facebook videos | 👍 likes · 💬 comments · 👁 views |
| Facebook pages | 👥 followers |
| Facebook Marketplace | price · location |

## How to use

Replace the original domain with your BetterEmbeds host — the platform is detected automatically:

```
twitter.com/user/status/123        →  yourhost/user/status/123
x.com/user/status/123             →  yourhost/user/status/123
instagram.com/p/ABC123/            →  yourhost/p/ABC123/
instagram.com/reel/ABC123/         →  yourhost/reel/ABC123/
tiktok.com/@user/video/12345       →  yourhost/@user/video/12345
reddit.com/r/sub/comments/abc/…   →  yourhost/r/sub/comments/abc/…
facebook.com/events/123            →  yourhost/events/123
facebook.com/marketplace/item/123  →  yourhost/marketplace/item/123
facebook.com/watch?v=123           →  yourhost/watch?v=123
```

Or use explicit prefixes:

```
yourhost/twitter/user/status/123
yourhost/instagram/p/ABC123/
yourhost/tiktok/@user/video/12345
yourhost/reddit/r/sub/comments/…
yourhost/facebook/events/123
```

Or paste any full URL:

```
yourhost/resolve?url=https://twitter.com/user/status/123
```

## Setup

```bash
git clone https://github.com/youruser/betterembeds
cd betterembeds
npm install
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
FACEBOOK_ACCESS_TOKEN=your_app_id|your_app_secret
```

The Facebook access token is optional but enables richer embeds for posts, events, videos, and pages. Without it, the service falls back to scraping public Open Graph tags. See [developers.facebook.com](https://developers.facebook.com) to create an app and get your App ID and App Secret.

```bash
npm start
```

## Deploy

Any Node.js host works. Put it behind a reverse proxy (Caddy, nginx) with a real domain and share that domain instead of the original social media link.

Example Caddyfile:

```
embeds.yourdomain.com {
    reverse_proxy localhost:3000
}
```

## How it works

1. Discord's crawler hits your host with a `Discordbot` user-agent
2. BetterEmbeds fetches the post from the platform's API or scrapes Open Graph tags
3. Returns an HTML page with `og:title`, `og:description`, `og:image`, `og:video`, and `theme-color` meta tags
4. Discord reads those tags and renders the rich embed
5. Real browsers are 302-redirected straight to the original URL

Responses are cached for 5 minutes.

## License

MIT
