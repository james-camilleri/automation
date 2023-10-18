import * as crypto from 'crypto'

export const verifySignature = (request: Request, secret: string) => {
  const requestSignature = request.headers.get('x-hub-signature-256')
  console.debug('requestSignature', requestSignature)
  console.debug('secret', secret)

  if (!requestSignature) {
    return false
  }

  const signature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(request.body))
    .digest('hex')

  console.debug('signature', signature)

  const trusted = Buffer.from(`sha256=${signature}`, 'ascii')
  const untrusted = Buffer.from(requestSignature, 'ascii')

  console.debug('trusted', trusted)
  console.debug('untrusted', untrusted)
  console.debug(
    'crypto.timingSafeEqual(trusted, untrusted)',
    crypto.timingSafeEqual(trusted, untrusted),
  )

  return crypto.timingSafeEqual(trusted, untrusted)
}
