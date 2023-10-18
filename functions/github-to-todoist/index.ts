import { Config, Context } from '@netlify/functions'

export default async (request: Request, context: Context) => {
  const payload = await request.json()
  console.log('request', request)
  console.log('payload', payload)
  console.log('context', context)

  return new Response('Called GitHub to Todoist webhook')
}

export const config: Config = {
  path: '/github-to-todoist/:projectId',
}
