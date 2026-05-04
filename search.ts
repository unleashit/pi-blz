interface SearchResult {
  title: string;
  url: string;
  content: string;
}

interface SearchResponse {
  results: SearchResult[];
}

export async function search(query: string, limit = 10): Promise<string> {
  const baseUrl = process.env.SEARXNG_URL;

  if (!baseUrl) {
    throw new Error("SEARXNG_URL is not set");
  }

  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("safesearch", "0");

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (process.env.SEARXNG_API_KEY) {
    headers.Authorization = `Bearer ${process.env.SEARXNG_API_KEY}`;
  }

  const res = await fetch(url.toString(), {
    headers,
  });

  if (!res.ok) {
    throw new Error(`SearxNG returned ${res.status}`);
  }

  const response = (await res.json()) as SearchResponse;
  const results = response.results.slice(0, limit);

  if (results.length === 0) {
    return `No results found for "${query}"`;
  }

  return results
    .map((r, i) => `## ${i + 1}. ${r.title}\n**URL:** ${r.url}\n${r.content}`)
    .join("\n\n---\n\n");
}
