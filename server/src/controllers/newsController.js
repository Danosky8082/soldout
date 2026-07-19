const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const GNEWS_BASE_URL = 'https://gnews.io/api/v4';
const NEWSAPI_BASE_URL = 'https://newsapi.org/v2';

/**
 * Fetch entertainment news from GNews and NewsAPI (combined)
 * GET /api/news/entertainment?limit=30&category=movies
 */
const getEntertainmentNews = async (req, res) => {
    try {
        const { limit = 30, category = 'entertainment' } = req.query;

        const promises = [];
        let hasGNews = false;
        let hasNewsAPI = false;

        // ----- 1. GNews -----
        if (GNEWS_API_KEY) {
            hasGNews = true;
            const gnewsQuery = category === 'all' || category === 'entertainment'
                ? 'movie OR film OR music OR soundtrack OR celebrity OR tv show'
                : category;
            const gnewsParams = new URLSearchParams({
                q: gnewsQuery,
                max: Math.min(limit, 30),
                lang: 'en',
                country: 'us',
                token: GNEWS_API_KEY,
                expand: 'content',
            });
            const gnewsUrl = `${GNEWS_BASE_URL}/search?${gnewsParams.toString()}`;
            promises.push(
                fetch(gnewsUrl)
                    .then(res => res.json())
                    .then(data => {
                        if (data.errors) {
                            console.warn('[GNews] Error:', data.errors);
                            return [];
                        }
                        return (data.articles || []).map(a => ({
                            title: a.title || 'Untitled',
                            description: a.description || a.content || '',
                            imageUrl: a.image || 'https://via.placeholder.com/600x337?text=No+Image',
                            source: a.source?.name || 'Unknown',
                            publishedAt: a.publishedAt || new Date().toISOString(),
                            url: a.url || '#',
                            category: detectCategory(a.title || '', a.description || ''),
                            _source: 'gnews',
                        }));
                    })
                    .catch(err => {
                        console.warn('[GNews] Fetch error:', err.message);
                        return [];
                    })
            );
        }

        // ----- 2. NewsAPI -----
        if (NEWSAPI_KEY) {
            hasNewsAPI = true;
            // NewsAPI categories: entertainment, music, movies, etc.
            let newsApiCategory = 'entertainment';
            if (category !== 'all' && category !== 'entertainment') {
                // Map our categories to NewsAPI's
                const map = {
                    movies: 'entertainment',
                    music: 'entertainment',
                    soundtracks: 'entertainment',
                    tv: 'entertainment',
                    celebrity: 'entertainment',
                };
                newsApiCategory = map[category] || 'entertainment';
            }
            const newsApiParams = new URLSearchParams({
                category: newsApiCategory,
                language: 'en',
                country: 'us',
                pageSize: Math.min(limit, 100),
                apiKey: NEWSAPI_KEY,
            });
            const newsApiUrl = `${NEWSAPI_BASE_URL}/top-headlines?${newsApiParams.toString()}`;
            promises.push(
                fetch(newsApiUrl)
                    .then(res => res.json())
                    .then(data => {
                        if (data.status === 'error') {
                            console.warn('[NewsAPI] Error:', data.message);
                            return [];
                        }
                        return (data.articles || []).map(a => ({
                            title: a.title || 'Untitled',
                            description: a.description || a.content || '',
                            imageUrl: a.urlToImage || 'https://via.placeholder.com/600x337?text=No+Image',
                            source: a.source?.name || 'Unknown',
                            publishedAt: a.publishedAt || new Date().toISOString(),
                            url: a.url || '#',
                            category: detectCategory(a.title || '', a.description || ''),
                            _source: 'newsapi',
                        }));
                    })
                    .catch(err => {
                        console.warn('[NewsAPI] Fetch error:', err.message);
                        return [];
                    })
            );
        }

        // ----- 3. Wait for all promises -----
        let results = [];
        if (promises.length > 0) {
            const allResults = await Promise.all(promises);
            results = allResults.flat();
        } else {
            // No API keys – use fallback
            console.warn('[News] No API keys provided, using fallback data');
            results = getFallbackNews();
        }

        // ----- 4. Deduplicate by title (case-insensitive) -----
        const seen = new Set();
        const deduped = results.filter(a => {
            const key = (a.title || '').toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // ----- 5. Sort by date (newest first) -----
        deduped.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

        // ----- 6. Limit results -----
        const finalResults = deduped.slice(0, parseInt(limit) || 30);

        res.json(finalResults);
    } catch (error) {
        console.error('[News] Combined error:', error);
        // Always return fallback on error
        res.status(200).json(getFallbackNews());
    }
};

// ===== Category Detection =====
function detectCategory(title, description) {
    const text = (title + ' ' + description).toLowerCase();
    if (text.includes('soundtrack') || text.includes('score') || text.includes('album') ||
        (text.includes('song') && text.includes('movie'))) {
        return 'soundtracks';
    }
    if (text.includes('music') || text.includes('song') || text.includes('album') ||
        text.includes('concert') || text.includes('band') || text.includes('singer')) {
        return 'music';
    }
    if (text.includes('tv') || text.includes('series') || text.includes('episode') ||
        text.includes('netflix') || text.includes('hbo') || text.includes('streaming')) {
        return 'tv';
    }
    if (text.includes('celebrity') || text.includes('star') || text.includes('actor') ||
        text.includes('actress') || text.includes('rumor') || text.includes('dating')) {
        return 'celebrity';
    }
    if (text.includes('movie') || text.includes('film') || text.includes('director') ||
        text.includes('cinema') || text.includes('blockbuster')) {
        return 'movies';
    }
    return 'general';
}

// ===== Fallback News =====
function getFallbackNews() {
    const now = new Date().toISOString();
    return [
        {
            title: 'Avengers: Doomsday – First Look Revealed',
            description: 'Marvel Studios has released the first official images from the highly anticipated Avengers: Doomsday.',
            imageUrl: 'https://via.placeholder.com/600x337?text=Avengers+Doomsday',
            source: 'Marvel Entertainment',
            publishedAt: now,
            url: '#',
            category: 'movies'
        },
        {
            title: 'Hans Zimmer to Score Christopher Nolan\'s Next Film',
            description: 'The legendary composer is reuniting with director Christopher Nolan for his upcoming untitled project.',
            imageUrl: 'https://via.placeholder.com/600x337?text=Hans+Zimmer',
            source: 'Film Music Magazine',
            publishedAt: now,
            url: '#',
            category: 'soundtracks'
        },
        {
            title: 'Beyoncé Announces World Tour 2026',
            description: 'Global superstar Beyoncé has announced a massive world tour for 2026.',
            imageUrl: 'https://via.placeholder.com/600x337?text=Beyonce+Tour',
            source: 'Music Today',
            publishedAt: now,
            url: '#',
            category: 'music'
        },
        {
            title: 'The Last of Us Season 3 Gets Early Renewal',
            description: 'HBO has renewed the critically acclaimed series The Last of Us for a third season.',
            imageUrl: 'https://via.placeholder.com/600x337?text=The+Last+of+Us',
            source: 'TV Insider',
            publishedAt: now,
            url: '#',
            category: 'tv'
        },
        {
            title: 'Tom Holland and Zendaya Engaged – Reports',
            description: 'Spider-Man co-stars Tom Holland and Zendaya are engaged after nearly five years of dating.',
            imageUrl: 'https://via.placeholder.com/600x337?text=Tom+Zendaya',
            source: 'Celebrity Buzz',
            publishedAt: now,
            url: '#',
            category: 'celebrity'
        }
    ];
}

module.exports = {
    getEntertainmentNews
};