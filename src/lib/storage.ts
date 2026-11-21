import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { devServices, invariant } from './core'

const bucket = process.env.S3_BUCKET
const s3 = bucket
  ? new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: !!process.env.S3_ENDPOINT,
    })
  : undefined
const location = process.env.LOCAL_OBJECT_DIRECTORY || '.local/objects'
function localPath(key: string) {
  invariant(
    devServices() && /^[a-f0-9-]{36}$/.test(key),
    'STORAGE_UNAVAILABLE',
    'Private storage is unavailable.',
    503,
  )
  return join(/*turbopackIgnore: true*/ location, key)
}
export type DocumentKind = 'identity' | 'academic' | 'photo'
export async function uploadBytes(file: File, kind: DocumentKind) {
  invariant(
    file.size > 0 && file.size <= 8 * 1024 * 1024,
    'INVALID_FILE',
    'Choose a file up to 8 MB.',
  )
  let body: Buffer<ArrayBufferLike> = Buffer.from(await file.arrayBuffer())
  let mime = ''
  const jpeg = body.subarray(0, 3).toString('hex') === 'ffd8ff'
  const png = body.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
  if (jpeg || png) {
    try {
      const image = sharp(body, { limitInputPixels: 20_000_000 }).rotate()
      body = await image
        .resize({
          width: kind === 'photo' ? 700 : 2600,
          height: kind === 'photo' ? 700 : 2600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: kind === 'photo' ? 84 : 90 })
        .toBuffer()
      mime = 'image/jpeg'
    } catch {
      invariant(false, 'INVALID_FILE', 'This image could not be read.')
    }
  } else if (
    kind !== 'photo' &&
    body.subarray(0, 5).toString() === '%PDF-' &&
    body.subarray(-2048).includes(Buffer.from('%%EOF'))
  ) {
    mime = 'application/pdf'
  }
  invariant(
    mime && body.length <= 8 * 1024 * 1024,
    'INVALID_FILE',
    'Use a valid JPG or PNG image, or a PDF for verification documents.',
  )
  const key = randomUUID()
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: mime,
      }),
    )
  } else {
    const path = localPath(key)
    await mkdir(location, { recursive: true, mode: 0o700 })
    await writeFile(path, body, { flag: 'wx', mode: 0o600 })
  }
  return { key, mime, size: body.length }
}
export async function removeObject(key: string) {
  if (s3) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  else await unlink(localPath(key))
}
export async function readObject(key: string) {
  if (!s3)
    return Uint8Array.from(
      await readFile(/*turbopackIgnore: true*/ localPath(key)),
    )
  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  )
  invariant(object.Body, 'FILE_UNAVAILABLE', 'The file is unavailable.', 404)
  return Uint8Array.from(await object.Body.transformToByteArray())
}
