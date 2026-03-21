import { router } from '../router'
import { getStoredAuthToken, removeStoredAuthToken } from './authToken'

const BASE_URL = '/api'

const defaultError = {
  code: 'INTERNAL_ERROR',
  message: 'Something went wrong. Please check your internet connection or contact our support.',
  status: 503,
  data: {},
}

function objectToQueryString(obj: Record<string, any>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(`${key}[]`, String(v)))
      } else {
        params.append(key, String(value))
      }
    }
  }
  return params.toString()
}

async function apiRequest(method: string, url: string, variables?: any): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getStoredAuthToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let fullUrl = `${BASE_URL}${url}`
  const options: RequestInit = { method: method.toUpperCase(), headers }

  if (method === 'get' && variables) {
    const qs = objectToQueryString(variables)
    if (qs) fullUrl += `?${qs}`
  } else if (method !== 'get' && variables) {
    options.body = JSON.stringify(variables)
  }

  const response = await fetch(fullUrl, options)

  if (!response.ok) {
    let errorData: any
    try {
      errorData = await response.json()
    } catch {
      throw defaultError
    }
    if (errorData?.error?.code === 'INVALID_TOKEN') {
      removeStoredAuthToken()
      router.push('/authenticate')
      throw errorData.error
    }
    throw errorData?.error || defaultError
  }

  return response.json()
}

async function optimisticUpdate(
  url: string,
  {
    updatedFields,
    currentFields,
    setLocalData,
  }: { updatedFields: any; currentFields: any; setLocalData: (fields: any) => void },
) {
  try {
    setLocalData(updatedFields)
    await apiRequest('put', url, updatedFields)
  } catch {
    setLocalData(currentFields)
  }
}

export default {
  get: (url: string, variables?: any) => apiRequest('get', url, variables),
  post: (url: string, variables?: any) => apiRequest('post', url, variables),
  put: (url: string, variables?: any) => apiRequest('put', url, variables),
  patch: (url: string, variables?: any) => apiRequest('patch', url, variables),
  delete: (url: string, variables?: any) => apiRequest('delete', url, variables),
  optimisticUpdate,
}
