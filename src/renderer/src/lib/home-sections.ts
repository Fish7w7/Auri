import type { HomeData, Work } from '@shared/contracts'

export interface HomeSectionModel {
  key: keyof HomeData
  title: string
  subtitle?: string
  works: Work[]
  viewAllPath?: string
}

export function getVisibleHomeSections(data: HomeData): HomeSectionModel[] {
  const sections: HomeSectionModel[] = [
    { key: 'continueReading', title: 'Continuar lendo', works: data.continueReading, viewAllPath: '/library/status/reading' },
    {
      key: 'staleReading',
      title: 'Parados há algum tempo',
      subtitle: 'Obras sem leitura há mais de 30 dias',
      works: data.staleReading
    },
    { key: 'waiting', title: 'Esperando acumular', works: data.waiting, viewAllPath: '/library/status/waiting' },
    { key: 'recentlyAdded', title: 'Adicionados recentemente', works: data.recentlyAdded, viewAllPath: '/library/sort/created_desc' }
  ]
  return sections.filter((section) => section.works.length > 0)
}
