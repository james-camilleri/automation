import { Config, Context } from '@netlify/functions'

export default async (request: Request, context: Context) => {
  console.log(request)
  return new Response('Called GitHub to Todoist webhook')
}

export const config: Config = {
  path: '/github-to-todoist/:projectId',
}
