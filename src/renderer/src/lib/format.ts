import type { MediaType, UserStatus } from '@shared/contracts'

export const STATUS_LABELS: Record<UserStatus, string> = {
  want_to_read: 'Quero ler',
  reading: 'Lendo',
  paused: 'Pausado',
  waiting: 'Esperando',
  completed: 'Finalizado',
  dropped: 'Abandonado'
}

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  manhwa: 'Manhwa',
  manga: 'Manga',
  manhua: 'Manhua',
  webtoon: 'Webtoon',
  novel: 'Novel',
  light_novel: 'Light Novel',
  other: 'Outro'
}

export const PUBLICATION_LABELS = {
  ongoing: 'Em andamento',
  completed: 'Finalizado',
  hiatus: 'Hiato',
  cancelled: 'Cancelado',
  unknown: 'Desconhecido',
  none: 'Sem informação'
} as const

export function formatChapter(label: string | null | undefined): string {
  return label ? `Cap. ${label}` : 'Sem progresso'
}

export function formatRelativeDate(value: string | null, now = new Date()): string {
  if (!value) return 'Nunca lido'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data indisponível'
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 30) return `há ${days} dias`
  const months = Math.floor(days / 30)
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.floor(months / 12)
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`
}

export function mapDomainError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'error' in error
      ? (error as { error?: { code?: string } }).error?.code
      : undefined
  switch (code) {
    case 'WORK_NOT_FOUND':
      return 'Esta obra não foi encontrada.'
    case 'WORK_IN_TRASH':
      return 'Esta obra está na Lixeira.'
    case 'CHAPTER_NOT_NUMERIC':
      return 'Esta ação só está disponível para capítulos numéricos.'
    case 'HISTORY_CANNOT_UNDO':
      return 'Esta alteração não pode mais ser desfeita.'
    case 'DUPLICATE_ALIAS':
      return 'Este título alternativo já está associado à obra.'
    case 'DUPLICATE_EXTERNAL_REF':
      return 'Este identificador externo já pertence a outra obra.'
    case 'METADATA_PROVIDER_UNAVAILABLE':
      return 'A pesquisa de metadados não está disponível agora.'
    case 'METADATA_RATE_LIMITED':
      return 'O AniList limitou as consultas temporariamente. Tente novamente em instantes.'
    case 'METADATA_NOT_FOUND':
      return 'A obra não foi encontrada no provedor.'
    case 'METADATA_DUPLICATE_ACTIVE':
      return 'Esta obra já está na Biblioteca.'
    case 'METADATA_DUPLICATE_TRASH':
      return 'Esta obra já está na Lixeira.'
    case 'METADATA_PROBABLE_DUPLICATE':
      return 'Uma obra com título semelhante já existe.'
    case 'COVER_TOO_LARGE':
      return 'A capa excede o limite de 10 MB.'
    case 'COVER_INVALID_IMAGE':
      return 'A URL não retornou uma imagem compatível.'
    case 'COVER_TIMEOUT':
      return 'O download da capa demorou demais.'
    default:
      return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
  }
}
