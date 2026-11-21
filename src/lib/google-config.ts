export function googleConfig() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_ORIGIN } = process.env
  if (
    !GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com') ||
    !GOOGLE_CLIENT_SECRET ||
    !APP_ORIGIN
  )
    return undefined
  try {
    const origin = new URL(APP_ORIGIN)
    const local =
      process.env.NODE_ENV !== 'production' &&
      origin.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    if (
      origin.origin !== APP_ORIGIN ||
      (!local && origin.protocol !== 'https:')
    )
      return undefined
    return {
      id: GOOGLE_CLIENT_ID,
      secret: GOOGLE_CLIENT_SECRET,
      origin: origin.origin,
    }
  } catch {
    return undefined
  }
}
