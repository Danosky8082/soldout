const fetch = require('node-fetch'); // or use global fetch (Node 18+)

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

/**
 * Search YouTube for videos (trailers, soundtracks, etc.)
 * GET /api/youtube/search?q=movie+trailer&type=video&maxResults=20
 */
const searchYouTube = async (req, res) => {
  try {
    const { q, type = 'video', maxResults = 20, order = 'date' } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    if (!YOUTUBE_API_KEY) {
      console.error('YOUTUBE_API_KEY is not set in environment variables.');
      return res.status(500).json({ error: 'YouTube API key not configured' });
    }

    const params = new URLSearchParams({
      part: 'snippet',
      q: q,
      type: type,
      maxResults: maxResults,
      order: order,
      key: YOUTUBE_API_KEY,
    });

    const response = await fetch(`${YOUTUBE_SEARCH_URL}?${params.toString()}`);
    const data = await response.json();

    if (data.error) {
      console.error('YouTube API error:', data.error);
      return res.status(400).json({ error: data.error.message });
    }

    // Transform the response to match your frontend's expected format
    const videos = data.items.map(item => ({
      id: 'yt_' + item.id.videoId,
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails.medium.url,
      channelName: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      publishedAt: item.snippet.publishedAt,
      source: 'youtube',
      // You can add more fields as needed (duration, views, etc.)
      // For now we'll set a placeholder views value; you can later fetch statistics separately.
      views: Math.floor(Math.random() * 50000) + 1000,
      year: new Date(item.snippet.publishedAt).getFullYear(),
      genre: detectGenre(item.snippet.title, item.snippet.description),
    }));

    res.json(videos);
  } catch (error) {
    console.error('YouTube search error:', error);
    res.status(500).json({ error: 'Failed to search YouTube' });
  }
};

// Simple genre detection (you can expand this)
function detectGenre(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  const genres = {
    action: ['action', 'explosive', 'battle', 'fight', 'war', 'attack'],
    adventure: ['adventure', 'quest', 'journey', 'explore'],
    animation: ['animation', 'animated', 'cartoon', 'pixar', 'disney'],
    comedy: ['comedy', 'funny', 'humor', 'hilarious', 'laugh'],
    crime: ['crime', 'criminal', 'detective', 'murder', 'mystery', 'police'],
    documentary: ['documentary', 'doc', 'real life', 'true story'],
    drama: ['drama', 'emotional', 'family', 'relationship', 'struggle'],
    fantasy: ['fantasy', 'magic', 'dragon', 'mythical', 'wizard'],
    horror: ['horror', 'scary', 'terrifying', 'ghost', 'halloween'],
    musical: ['musical', 'soundtrack', 'song', 'music', 'orchestra'],
    romance: ['romance', 'love', 'kiss', 'wedding', 'heart'],
    'sci-fi': ['sci-fi', 'science fiction', 'space', 'alien', 'futuristic', 'robot'],
    thriller: ['thriller', 'suspense', 'mystery', 'twist', 'tense'],
    western: ['western', 'cowboy', 'wild west', 'frontier']
  };
  for (const [genre, keywords] of Object.entries(genres)) {
    if (keywords.some(k => text.includes(k))) {
      return genre;
    }
  }
  return 'Unknown';
}

module.exports = {
  searchYouTube
};