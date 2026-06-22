import { buildTool } from '../../Tool.js'
import { getApiKey } from '../../auth/credentials.js'

const UAPI_ENDPOINT = 'https://uapis.cn/api/v1/search/aggregate'
// Default key — can be overridden by storing a key under platform "uapi" via /api-key
const DEFAULT_UAPI_KEY = 'uapi-jspeglsk_KGqCEfTptSdOc2H_a5x7K9TpxR0wP7F'

export const webSearchTool = buildTool({
  name: 'web_search',
  description: 'Search the web and return results. Returns titles, URLs, and snippets.',
  inputSchema: {
    type: 'object',
    properties: {
      query:      { type: 'string',  description: 'Search query' },
      time_range: { type: 'string',  description: 'Optional: day | week | month | year' },
      site:       { type: 'string',  description: 'Optional: restrict to specific domain' },
    },
    required: ['query'],
  },
  async call(input) {
    const query      = input.query      as string
    const time_range = input.time_range as string | undefined
    const site       = input.site       as string | undefined

    // Prefer user-configured key, fall back to default
    const apiKey = (await getApiKey('uapi')) || DEFAULT_UAPI_KEY

    const body: Record<string, any> = { query }
    if (time_range) body.time_range = time_range
    if (site)       body.site       = site

    try {
      const resp = await fetch(UAPI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(`UAPI ${resp.status}: ${errText.slice(0, 200)}`)
      }

      const contentType = resp.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const errText = await resp.text()
        throw new Error(`UAPI 返回非 JSON 响应 (${contentType}): ${errText.slice(0, 200)}`)
      }

      const data: any = await resp.json()
      const results: any[] = data.results || []

      if (!results.length) return { data: `未找到"${query}"的相关结果` }

      const lines = results.slice(0, 8).map((r: any, i: number) => {
        const time = r.publish_time ? ` (${r.publish_time.slice(0, 10)})` : ''
        return `${i + 1}. ${r.title}${time}\n   ${r.url}\n   ${r.snippet || ''}`
      })

      return { data: `搜索"${query}"，共 ${data.total_results} 条结果：\n\n${lines.join('\n\n')}` }
    } catch (err: any) {
      return { data: `搜索失败: ${err.message}` }
    }
  },
})
