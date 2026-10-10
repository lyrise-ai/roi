import { createContext, useContext } from 'react'

export const AuthSessionContext = createContext({ user: null, isReady: false })

export function useAuthSession() {
  return useContext(AuthSessionContext)
}
