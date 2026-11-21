import 'dotenv/config'
import { randomBytes } from 'node:crypto'

export function testDatabase() {
  const configured = process.env.TEST_DATABASE_URL
  const url = new URL(
    configured ||
      process.env.DATABASE_URL ||
      'postgresql://balasore:local_development_only@127.0.0.1:55432/postgres',
  )
  if (!configured) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('Set TEST_DATABASE_URL to a dedicated test database.')
    url.pathname = '/balasore_test'
  }
  if (!url.pathname.endsWith('_test'))
    throw new Error('The test database name must end in _test.')
  return url.toString()
}
export function testEnv() {
  return {
    DATABASE_URL: testDatabase(),
    APP_ORIGIN: 'http://localhost:3107',
    DEV_SERVICES: '1',
    APP_SECRET: process.env.TEST_APP_SECRET || randomBytes(32).toString('hex'),
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    TWILIO_ENABLED: '0',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    TWILIO_VERIFY_SERVICE: '',
    TWILIO_SMS_FROM: '',
    TWILIO_WHATSAPP_FROM: '',
    S3_BUCKET: '',
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
    RAZORPAY_WEBHOOK_SECRET: '',
    LOCAL_OBJECT_DIRECTORY: '.local/test-objects',
  }
}
