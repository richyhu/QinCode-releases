import { buildTool } from '../../Tool.js'

export const webFetchTool = buildTool({
  name: 'web_fetch',
  description: 'Fetch content from a URL.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
    },
    required: ['url'],
  },
  async call(input, context) {
    const url = input.url as string
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const contentType = resp.headers.get('content-type') || ''
      const text = await resp.text()

      // Extract readable text from HTML
      if (contentType.includes('text/html')) {
        const cleaned = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 8000)
        return { data: cleaned }
      }

      // Plain text or JSON
      return { data: text.slice(0, 8000) }
    } catch (err: any) {
      return { data: `Fetch failed: ${err.message}` }
    }
  },
})
