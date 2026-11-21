import { useState } from 'react'
import { Backend } from './backend'
import { createHttpClient } from './httpClient'
import { getAccessToken } from '@/shared/auth/supabaseClient'
import { env } from '@/shared/config/env'

export function useBackend() {
  return useState(() => new Backend(createHttpClient({ baseUrl: env.apiUrl, getAccessToken })))[0]
}
