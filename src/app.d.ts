declare global {
  namespace App {
    interface Locals {
      auth(): Promise<import('@auth/core/types').Session | null>
    }
    interface PageData {
      session?: import('@auth/core/types').Session | null
    }
  }
}

export {}
