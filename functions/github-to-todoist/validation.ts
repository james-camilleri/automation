import * as crypto from 'crypto'

export const verifySignature = (request: Request, secret: string) => {
  const requestSignature = request.headers.get('x-hub-signature-256')
  if (!requestSignature) {
    return false
  }

  const signature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(request.body))
    .digest('hex')

  const trusted = Buffer.from(`sha256=${signature}`, 'ascii')
  const untrusted = Buffer.from(requestSignature, 'ascii')

  return crypto.timingSafeEqual(trusted, untrusted)
}
