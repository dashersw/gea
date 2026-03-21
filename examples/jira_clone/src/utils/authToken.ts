export const getStoredAuthToken = (): string | null => localStorage.getItem('authToken')

export const storeAuthToken = (token: string): void => localStorage.setItem('authToken', token)

export const removeStoredAuthToken = (): void => localStorage.removeItem('authToken')
