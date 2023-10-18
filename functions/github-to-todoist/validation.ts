import * as crypto from 'crypto'

export async function verifyGithubEvent(request: Request, secret: string) {
  const requestSignature = request.headers.get('x-hub-signature-256')
  const body = await request.text()

  console.debug('requestSignature', requestSignature)
  console.debug('secret', secret)

  if (!requestSignature) {
    return
  }

  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex')

  console.debug('signature', signature)

  const trusted = Buffer.from(`sha256=${signature}`, 'ascii')
  const untrusted = Buffer.from(requestSignature, 'ascii')

  console.debug('trusted', trusted)
  console.debug('untrusted', untrusted)
  console.debug(
    'crypto.timingSafeEqual(trusted, untrusted)',
    crypto.timingSafeEqual(trusted, untrusted),
  )

  if (crypto.timingSafeEqual(trusted, untrusted)) {
    return JSON.parse(body)
  }
}
