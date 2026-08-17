export interface Migration {
  readonly version: number
  readonly name: string
  up(): void
}

