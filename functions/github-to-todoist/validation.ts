import * as crypto from 'crypto'

export async function verifyGithubEvent(request: Request, secret: string) {
  const requestSignature = request.headers.get('x-hub-signature-256')
  const body = await request.text()

  if (!requestSignature) {
    return
  }

  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const trusted = Buffer.from(`sha256=${signature}`, 'ascii')
  const untrusted = Buffer.from(requestSignature, 'ascii')

  if (crypto.timingSafeEqual(trusted, untrusted)) {
    return JSON.parse(body)
  }
}
