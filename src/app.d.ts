declare global {
  namespace App {
    interface Locals {
      auth(): Promise<import('@auth/core/types').Session | null>
    }
    interface PageData {
      session?: import('@auth/core/types').Session | null
    }
    interface Error {
      message: string
      id?: string // correlation id; the full error is logged server-side in handleError
    }
  }
}

export {}
