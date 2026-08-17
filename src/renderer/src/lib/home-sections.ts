import type { HomeData, Work } from '@shared/contracts'

export interface HomeSectionModel {
  key: keyof HomeData
  title: string
  subtitle?: string
  works: Work[]
}

export function getVisibleHomeSections(data: HomeData): HomeSectionModel[] {
  const sections: HomeSectionModel[] = [
    { key: 'continueReading', title: 'Continue lendo', works: data.continueReading },
    {
      key: 'staleReading',
      title: 'Parados há algum tempo',
      subtitle: 'Obras sem leitura há mais de 30 dias',
      works: data.staleReading
    },
    { key: 'waiting', title: 'Esperando acumular', works: data.waiting },
    { key: 'recentlyAdded', title: 'Adicionados recentemente', works: data.recentlyAdded }
  ]
  return sections.filter((section) => section.works.length > 0)
}

