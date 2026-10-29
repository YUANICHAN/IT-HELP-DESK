import { httpClient } from '../../shared/api/httpClient.js'
import { adminHealthSchema, publicHealthSchema } from './schemas.js'

export async function getPublicHealth({ signal } = {}) {
  return publicHealthSchema.parse(
    await httpClient.get('/health', { auth: 'none', signal }),
  )
}

export async function getAdminHealth({ signal } = {}) {
  return adminHealthSchema.parse(
    await httpClient.get('/admin/health', { signal }),
  )
}
